import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHostMembers, submitHostMemberProfile } from "@/features/host/api/host-api";
import { createHostMembersActions, publishHostMembersRefresh } from "./host-members-data";

vi.mock("@/features/host/api/host-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/api/host-api")>()),
  fetchHostMembers: vi.fn(),
  submitHostMemberProfile: vi.fn(),
}));

const context = { clubSlug: "reading-sai" };

describe("host members factory publication fence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps profile execution observation-only", async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const set = vi.spyOn(client, "setQueryData");
    vi.mocked(submitHostMemberProfile).mockResolvedValue(new Response(JSON.stringify({ membershipId: "m-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await createHostMembersActions(client, context).submitProfile("m-1", "새 이름");

    expect(invalidate).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("writes cache only through the explicit accepted-owner publisher", async () => {
    const client = new QueryClient();
    const page = { items: [], nextCursor: null };
    vi.mocked(fetchHostMembers).mockResolvedValue(page);

    await publishHostMembersRefresh(client, context);

    expect(fetchHostMembers).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().getAll()).not.toHaveLength(0);
  });
});
