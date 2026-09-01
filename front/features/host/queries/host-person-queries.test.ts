import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHostPersonDetail } from "../api/host-person-api";
import { hostPersonDetailQuery, hostPersonKeys } from "./host-person-queries";

vi.mock("../api/host-person-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/host-person-api")>()),
  fetchHostPersonDetail: vi.fn(),
}));

describe("host person query identity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes club person and continuation parameters without using the member list", async () => {
    vi.mocked(fetchHostPersonDetail).mockResolvedValue({
      membershipId: "member-1",
      displayName: "가람",
      avatarKey: "mushroom-green-book",
      status: "ACTIVE",
      role: "MEMBER",
      lastClubAccessAt: null,
      currentSchedule: null,
      currentRsvp: null,
      attendanceHistory: { items: [], nextCursor: null },
    });
    const context = { clubSlug: "reading-sai" } as const;
    const page = { attendanceCursor: "next-1", limit: 20 };
    const client = new QueryClient();

    await client.fetchQuery(hostPersonDetailQuery("member-1", page, context));

    expect(hostPersonKeys.detail("member-1", page, context)).toEqual([
      "host", "reading-sai", "people", "member-1", "detail", page,
    ]);
    expect(fetchHostPersonDetail).toHaveBeenCalledWith("member-1", page, context);
    expect(hostPersonKeys.detail("member-1", page, context)).not.toEqual(
      hostPersonKeys.detail("member-2", page, context),
    );
  });

  it.each(["", "   ", "\t"])("rejects present blank cursor %j before key creation", (attendanceCursor) => {
    expect(() => hostPersonDetailQuery(
      "member-1",
      { attendanceCursor, limit: 20 },
      { clubSlug: "reading-sai" },
    )).toThrow("host person cursor must contain a non-whitespace byte");
    expect(fetchHostPersonDetail).not.toHaveBeenCalled();
  });

  it("preserves valid opaque cursor bytes in the query identity", () => {
    const context = { clubSlug: "reading-sai" } as const;
    const page = { attendanceCursor: "  next+/=  ", limit: 20 };

    expect(hostPersonDetailQuery("member-1", page, context).queryKey.at(-1)).toEqual(page);
  });
});
