import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listHostInvitationsResponse } from "@/features/host/api/host-api";
import {
  hostInvitationKeys,
  hostInvitationListQuery,
  invalidateHostInvitations,
} from "./host-invitation-queries";

vi.mock("@/features/host/api/host-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/host/api/host-api")>();
  return { ...actual, listHostInvitationsResponse: vi.fn() };
});

const context = { clubSlug: "reading-sai" } as const;

describe("host invitation query scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the canonical club prefix and forwards context to the response parser boundary", async () => {
    vi.mocked(listHostInvitationsResponse).mockResolvedValue(new Response(JSON.stringify({
      items: [],
      nextCursor: null,
    }), { headers: { "Content-Type": "application/json" } }));
    const client = new QueryClient();

    await client.fetchQuery(hostInvitationListQuery(undefined, context));

    expect(hostInvitationKeys.list(undefined, context)).toEqual([
      "host", "reading-sai", "invitations", "list", {},
    ]);
    expect(listHostInvitationsResponse).toHaveBeenCalledWith(context, undefined);
  });

  it("invalidates only the exact club invitation scope", async () => {
    const client = new QueryClient();
    const exact = hostInvitationKeys.list(undefined, context);
    const other = hostInvitationKeys.list(undefined, { clubSlug: "other-club" });
    client.setQueryData(exact, { items: [] });
    client.setQueryData(other, { items: [] });

    await invalidateHostInvitations(client, context);

    expect(client.getQueryState(exact)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  });
});
