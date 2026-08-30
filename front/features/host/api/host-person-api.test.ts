import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHostPersonDetail } from "./host-person-api";
import { HostPersonDetailSchema } from "./host-person-contracts";

const valid = {
  membershipId: "00000000-0000-0000-0000-000000000202",
  displayName: "가람",
  avatarKey: "mushroom-green-book",
  status: "ACTIVE",
  role: "MEMBER",
  lastClubAccessAt: "2026-08-30T01:00:00Z",
  currentSchedule: {
    state: "OPEN",
    scheduleRevision: 7,
    scheduledAt: "2026-09-01T19:00:00",
  },
  currentRsvp: "GOING",
  attendanceHistory: {
    items: [{ sessionNumber: 6, scheduledAt: "2026-08-20T19:00:00", attendanceStatus: "ATTENDED" }],
    nextCursor: "opaque.person.cursor",
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("host person API", () => {
  it("encodes the membership path and forwards club plus continuation parameters", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(valid), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchHostPersonDetail(
      "member+with spaces",
      { attendanceCursor: "cursor+/=", limit: 20 },
      { clubSlug: "reading-sai" },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/bff/api/host/people/member%2Bwith%20spaces?attendanceCursor=cursor%2B%2F%3D&limit=20&clubSlug=reading-sai",
    );
  });

  it("uses strict recursive allowlists and rejects forbidden account telemetry", () => {
    expect(HostPersonDetailSchema.parse(valid)).toEqual(valid);
    expect(() => HostPersonDetailSchema.parse({ ...valid, email: "private@example.test" })).toThrow();
    expect(() => HostPersonDetailSchema.parse({
      ...valid,
      attendanceHistory: { ...valid.attendanceHistory, pagePath: "/private" },
    })).toThrow();
  });
});
