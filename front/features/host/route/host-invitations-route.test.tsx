import { describe, expect, it, vi } from "vitest";
import type { HostInvitationsActions } from "@/features/host/model/host-invitation-actions";
import { TransitionOwnerObsoleteError } from "@/shared/ui/use-transition-safety-owner";
import { registerHostInvitationActions } from "./host-invitations-route";

function actions(): HostInvitationsActions {
  return {
    listInvitations: vi.fn(async () => new Response(JSON.stringify({ items: [], nextCursor: null }))),
    refreshInvitations: vi.fn(async () => ({ items: [], nextCursor: null })),
    createInvitation: vi.fn(async () => { throw new TypeError("response lost"); }),
    revokeInvitation: vi.fn(async () => { throw new TypeError("response lost"); }),
    parseInvitation: vi.fn(),
    parseInvitationList: vi.fn(),
  };
}

describe("host invitation transition owner", () => {
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
