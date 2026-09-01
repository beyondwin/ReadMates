import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HostInvitationsActions } from "@/features/host/model/host-invitation-actions";
import { createGlobalSpaceTransitionCoordinator } from "@/src/app/global-space-transition";
import { SpaceTransitionSafetyProvider } from "@/shared/ui/space-transition-safety-context";
import { TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";
import { registerHostInvitationActions } from "./host-invitations-route";

function actions(): HostInvitationsActions {
  return {
    listInvitations: vi.fn(async () => new Response(JSON.stringify({ items: [], nextCursor: null }))),
    refreshInvitations: vi.fn(async () => ({ items: [], nextCursor: null })),
    publishInvitations: vi.fn(),
    createInvitation: vi.fn(async () => { throw new TypeError("response lost"); }),
    revokeInvitation: vi.fn(async () => { throw new TypeError("response lost"); }),
    parseInvitation: vi.fn(),
    parseInvitationList: vi.fn(),
  };
}

describe("host invitation transition owner", () => {
  it("publishes accepted create refresh inside the route owner and exposes only an owner-fenced UI result", async () => {
    const created = {
      invitationId: "invite-1", email: "member@example.com", name: "멤버", acceptUrl: "https://example.invalid/invite",
      applyToCurrentSession: true, effectiveStatus: "PENDING", expiresAt: "2026-09-01T00:00:00Z",
    } as never;
    const refreshed = { items: [], nextCursor: null };
    const source = actions();
    vi.mocked(source.createInvitation).mockResolvedValue(new Response("{}", { status: 201 }));
    vi.mocked(source.parseInvitation).mockResolvedValue(created);
    vi.mocked(source.refreshInvitations).mockResolvedValue(refreshed);
    const publishAccepted = vi.fn(({ publish }) => {
      publish({ operationId: "create", outcome: "succeeded" });
      return "published" as const;
    });
    const owner = {
      begin: vi.fn(() => ({
        generation: 1,
        settle: vi.fn(async () => "accepted" as const),
        publishAccepted,
        unregister: vi.fn(),
        reconcile: vi.fn(),
      })),
      beginReceipt: vi.fn(),
    };

    const result = await registerHostInvitationActions(source, owner as never).createInvitation({
      email: "member@example.com", name: "멤버", applyToCurrentSession: true,
    });
    const uiPublication = vi.fn();

    expect(source.createInvitation).toHaveBeenCalledTimes(1);
    expect(source.refreshInvitations).toHaveBeenCalledTimes(1);
    expect(source.publishInvitations).toHaveBeenCalledWith(refreshed, { limit: 50 });
    expect(result).toMatchObject({ created, refreshed });
    expect(result.publishUi(uiPublication)).toBe("published");
    expect(uiPublication).toHaveBeenCalledWith({ created, refreshed });
    expect(publishAccepted.mock.calls.map(([action]) => action.surface)).toEqual(["cache", "ui"]);
  });

  it("never refreshes or exposes row publication after accepted response becomes obsolete", async () => {
    const source = actions();
    vi.mocked(source.createInvitation).mockResolvedValue(new Response("{}", { status: 201 }));
    const owner = {
      begin: vi.fn(() => ({
        generation: 1,
        settle: vi.fn(async () => "obsolete" as const),
        publishAccepted: vi.fn(() => "rejected" as const),
        unregister: vi.fn(),
        reconcile: vi.fn(),
      })),
      beginReceipt: vi.fn(),
    };

    await expect(registerHostInvitationActions(source, owner as never).createInvitation({
      email: "member@example.com", name: "멤버", applyToCurrentSession: true,
    })).rejects.toBeInstanceOf(TransitionOwnerObsoleteError);
    expect(source.createInvitation).toHaveBeenCalledTimes(1);
    expect(source.refreshInvitations).not.toHaveBeenCalled();
  });

  it("publishes no delayed cache or UI result after the accepted route owner unmounts", async () => {
    const source = actions();
    const refreshed = { items: [], nextCursor: null };
    let releaseRefresh!: () => void;
    const refreshDelay = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const cachePublication = vi.fn();
    vi.mocked(source.createInvitation).mockResolvedValue(new Response("{}", { status: 201 }));
    vi.mocked(source.parseInvitation).mockResolvedValue({ invitationId: "invite-1" } as never);
    vi.mocked(source.listInvitations).mockImplementation(async () => {
      await refreshDelay;
      return new Response(JSON.stringify(refreshed), {
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.mocked(source.parseInvitationList).mockResolvedValue(refreshed);
    vi.mocked(source.refreshInvitations).mockImplementation(async () => {
      await refreshDelay;
      return refreshed;
    });
    vi.mocked(source.publishInvitations).mockImplementation(cachePublication);
    const coordinator = createGlobalSpaceTransitionCoordinator();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SpaceTransitionSafetyProvider port={coordinator}>{children}</SpaceTransitionSafetyProvider>
    );
    const { result, unmount } = renderHook(() => {
      const owner = useTransitionSafetyOwner("host-invitations");
      return registerHostInvitationActions(source, owner);
    }, { wrapper });

    const request = result.current.createInvitation({
      email: "member@example.com",
      name: "멤버",
      applyToCurrentSession: true,
    });
    await vi.waitFor(() => expect(
      vi.mocked(source.listInvitations).mock.calls.length
      + vi.mocked(source.refreshInvitations).mock.calls.length,
    ).toBe(1));
    act(() => unmount());
    releaseRefresh();

    await expect(request).rejects.toBeInstanceOf(TransitionOwnerObsoleteError);
    expect(cachePublication).not.toHaveBeenCalled();
  });

  it("settles a definite HTTP failure without detached lookup or cache publication", async () => {
    const source = actions();
    vi.mocked(source.createInvitation).mockResolvedValue(new Response("{}", { status: 409 }));
    const settle = vi.fn(async () => "accepted" as const);
    const publishAccepted = vi.fn(({ publish }) => {
      publish({ operationId: "create", outcome: "failed" });
      return "published" as const;
    });
    const owner = {
      begin: vi.fn(() => ({
        generation: 1,
        settle,
        publishAccepted,
        unregister: vi.fn(),
        reconcile: vi.fn(),
      })),
      beginReceipt: vi.fn(),
    };

    const failure = await registerHostInvitationActions(source, owner as never).createInvitation({
      email: "member@example.com", name: "멤버", applyToCurrentSession: true,
    }).catch((error: unknown) => error as { status: number; publishUi: (publish: (value: unknown) => void) => string });
    const errorPublication = vi.fn();

    expect(failure).toMatchObject({ status: 409 });
    expect(failure.publishUi(errorPublication)).toBe("published");
    expect(errorPublication).toHaveBeenCalledWith(failure);
    expect(settle).toHaveBeenCalledWith("failed");
    expect(source.listInvitations).not.toHaveBeenCalled();
    expect(source.refreshInvitations).not.toHaveBeenCalled();
    expect(publishAccepted.mock.calls.map(([action]) => action.surface)).toEqual(["errorCopy"]);
  });

  it("settles a definite revoke HTTP failure without detached lookup or cache publication", async () => {
    const source = actions();
    vi.mocked(source.revokeInvitation).mockResolvedValue(new Response("{}", { status: 500 }));
    const settle = vi.fn(async () => "accepted" as const);
    const owner = {
      begin: vi.fn(() => ({
        generation: 1,
        settle,
        publishAccepted: vi.fn(),
        unregister: vi.fn(),
        reconcile: vi.fn(),
      })),
      beginReceipt: vi.fn(),
    };

    await expect(registerHostInvitationActions(source, owner as never).revokeInvitation("invite-1"))
      .rejects.toMatchObject({ status: 500 });
    expect(settle).toHaveBeenCalledWith("failed");
    expect(source.listInvitations).not.toHaveBeenCalled();
    expect(source.refreshInvitations).not.toHaveBeenCalled();
  });

  it.each(["create", "revoke"] as const)("keeps %s response loss L1 unknown without replay or cache publication", async (kind) => {
    const source = actions();
    let reconcile!: () => Promise<{ operationId: string; outcome: "still-unknown" }>;
    const owner = {
      begin: vi.fn((_: string, __: "L1", recovery: typeof reconcile) => {
        reconcile = recovery;
        return {
          generation: 1,
          settle: vi.fn(),
          publishAccepted: vi.fn(),
          unregister: vi.fn(),
          reconcile: () => reconcile(),
        };
      }),
      beginReceipt: vi.fn(),
    };
    const registered = registerHostInvitationActions(source, owner as never);

    const result = kind === "create"
      ? registered.createInvitation({ email: "member@example.com", name: "멤버", applyToCurrentSession: true })
      : registered.revokeInvitation("invite-1");

    await expect(result).rejects.toBeInstanceOf(TransitionOwnerObsoleteError);
    expect(source.createInvitation).toHaveBeenCalledTimes(kind === "create" ? 1 : 0);
    expect(source.revokeInvitation).toHaveBeenCalledTimes(kind === "revoke" ? 1 : 0);
    expect(source.listInvitations).toHaveBeenCalledTimes(1);
    expect(source.refreshInvitations).not.toHaveBeenCalled();
  });
});
