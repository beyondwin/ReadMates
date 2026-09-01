import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listHostInvitationsResponse } from "@/features/host/api/host-api";
import { hostInvitationListQuery } from "@/features/host/queries/host-invitation-queries";
import { createHostInvitationsActions } from "./host-invitations-data";

vi.mock("@/features/host/api/host-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/host/api/host-api")>();
  return { ...actual, listHostInvitationsResponse: vi.fn() };
});

const context = { clubSlug: "reading-sai" } as const;

const createdPage = {
  items: [{
    invitationId: "invite-new",
    email: "new@example.com",
    name: "새멤버",
    role: "MEMBER",
    status: "PENDING",
    effectiveStatus: "PENDING",
    expiresAt: "2026-05-20T12:00:00Z",
    acceptedAt: null,
    createdAt: "2026-04-20T12:00:00Z",
    canRevoke: true,
    canReissue: true,
    applyToCurrentSession: true,
  }],
  nextCursor: null,
};

describe("createHostInvitationsActions refresh publication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("observes outside the cache, then publishes only when the route owner requests it", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    const query = hostInvitationListQuery({ limit: 50 }, context);
    client.setQueryData(query.queryKey, { items: [], nextCursor: null });

    vi.mocked(listHostInvitationsResponse).mockImplementation(async () => {
      return new Response(JSON.stringify(createdPage), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const actions = createHostInvitationsActions(client, context);
    const page = await actions.refreshInvitations({ limit: 50 });

    expect(client.getQueryData(query.queryKey)).toEqual({ items: [], nextCursor: null });
    actions.publishInvitations(page, { limit: 50 });
    expect(client.getQueryData(query.queryKey)).toEqual(createdPage);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.invitationId).toBe("invite-new");
  });

  it("keeps detached list observation outside Query cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(listHostInvitationsResponse).mockResolvedValue(new Response(JSON.stringify(createdPage), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await createHostInvitationsActions(client, context).listInvitations({ limit: 50 });

    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
