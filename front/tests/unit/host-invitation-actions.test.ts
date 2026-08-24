import { afterEach, describe, expect, it, vi } from "vitest";
import { createInvitation, listInvitations, revokeInvitation } from "@/features/host/actions/invitations";
import { ReadMatesSessionExpiredError, __resetRedirectGuardForTest } from "@/shared/api/client";
import { __resetHostClientContractCapabilityForTest } from "@/shared/api/host-client-contract";

const context = { clubSlug: "reading-sai" } as const;

afterEach(() => {
  __resetRedirectGuardForTest();
  __resetHostClientContractCapabilityForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("host invitation actions", () => {
  it("routes list, create, and revoke through the centralized ReadMates fetch helper", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.includes("/__internal/client-contract-status")
        ? new Response(JSON.stringify({
            schemaVersion: 1,
            supportedHostClientContracts: ["v3"],
          }), { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } })
        : new Response(null, { status: 204 }),
    ));
    vi.stubGlobal("fetch", fetchMock);

    await listInvitations(context);
    await createInvitation({ email: "member@example.com", name: "Member" }, context);
    await revokeInvitation("invite id/1", context);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/bff/api/host/invitations?clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bff/api/host/invitations?clubSlug=reading-sai",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "member@example.com", name: "Member" }),
        cache: "no-store",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/bff/api/host/invitations/invite%20id%2F1/revoke?clubSlug=reading-sai",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
      }),
    );

    const createHeaders = fetchMock.mock.calls[2]?.[1]?.headers;
    expect(createHeaders).toBeInstanceOf(Headers);
    expect((createHeaders as Headers).get("Content-Type")).toBe("application/json");
  });

  it("uses centralized 401 handling for invitation responses", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const causes: string[] = [];
    window.addEventListener("readmates:session-expired", ((event: CustomEvent) => {
      causes.push(event.detail.cause);
    }) as EventListener, { once: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign: assignMock });

    await expect(listInvitations(context)).rejects.toThrow(ReadMatesSessionExpiredError);

    expect(assignMock).toHaveBeenCalledWith("/login");
    expect(causes).toEqual([]);
  });
});
