import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHostMembers } from "@/features/host/api/host-api";
import {
  hostMemberKeys,
  hostMemberListQuery,
  invalidateHostMembers,
} from "./host-members-queries";

vi.mock("@/features/host/api/host-api", () => ({
  fetchHostMembers: vi.fn(),
  submitHostMemberLifecycle: vi.fn(),
  submitHostMemberProfile: vi.fn(),
  submitHostViewerAction: vi.fn(),
}));

const context = { clubSlug: "reading-sai" } as const;

describe("host member query scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("places the canonical club slug directly after the shared host prefix", async () => {
    vi.mocked(fetchHostMembers).mockResolvedValue({ items: [], nextCursor: null });
    const client = new QueryClient();

    await client.fetchQuery(hostMemberListQuery(undefined, context));

    expect(hostMemberKeys.list(undefined, context)).toEqual([
      "host", "reading-sai", "members", "list", {},
    ]);
    expect(fetchHostMembers).toHaveBeenCalledWith(context, undefined);
  });

  it("invalidates only the exact club member scope", async () => {
    const client = new QueryClient();
    const exact = hostMemberKeys.list(undefined, context);
    const other = hostMemberKeys.list(undefined, { clubSlug: "other-club" });
    client.setQueryData(exact, { items: [] });
    client.setQueryData(other, { items: [] });

    await invalidateHostMembers(client, context);

    expect(client.getQueryState(exact)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  });
});
