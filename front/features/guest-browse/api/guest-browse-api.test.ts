import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGuestArchive,
  fetchGuestBrowseShell,
  fetchGuestCurrentSession,
  fetchGuestNoteFeed,
  fetchGuestNoteSessions,
  fetchGuestUpcomingSessions,
} from "./guest-browse-api";
import { GuestBrowseShellSchema } from "./guest-browse-contracts";
import { readmatesPublicFetchResponse } from "@/shared/api/client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const shell = {
  clubName: "읽는 모임",
  tagline: "함께 읽습니다",
  navigation: {
    home: "OPEN",
    current: "OPEN",
    notes: "OPEN",
    archive: "OPEN",
    sessionDetail: "OPEN",
    personalSpace: "PREVIEW",
    personalRecords: "PREVIEW",
    settings: "LOCKED",
    notifications: "LOCKED",
    feedback: "LOCKED",
    host: "DENY",
  },
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

const currentSession = {
  currentSession: {
    sessionId: "session-1",
    sessionNumber: 1,
    title: "첫 모임",
    bookTitle: "책",
    bookAuthor: "작가",
    bookLink: null,
    bookImageUrl: null,
    date: "2026-08-02",
    startTime: "19:00",
    endTime: "21:00",
    questionDeadlineAt: "2026-08-01T19:00:00+09:00",
    attendees: [],
    board: { questions: [], longReviews: [] },
  },
};

describe("guest browse API", () => {
  it("does not redirect or inject member club context for guest reads", async () => {
    const assign = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(shell));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign, hash: "", pathname: "/clubs/other/app", search: "" });

    await expect(fetchGuestBrowseShell("alpha")).resolves.toEqual(shell);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/bff/api/public/clubs/alpha/browse");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("keeps a guest 401 response non-redirecting", async () => {
    const assign = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign, hash: "", pathname: "/clubs/alpha/app", search: "" });

    await expect(readmatesPublicFetchResponse("/api/public/clubs/alpha/browse")).resolves.toHaveProperty("status", 401);

    expect(assign).not.toHaveBeenCalled();
  });

  it("uses the browse endpoints with a default page size of twenty", async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(jsonResponse(path.endsWith("/sessions/current") ? currentSession : { items: [], nextCursor: null })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      fetchGuestCurrentSession("alpha"),
      fetchGuestUpcomingSessions("alpha"),
      fetchGuestNoteSessions("alpha"),
      fetchGuestNoteFeed("alpha"),
      fetchGuestArchive("alpha"),
    ]);

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/bff/api/public/clubs/alpha/browse/sessions/current",
      "/api/bff/api/public/clubs/alpha/browse/sessions/upcoming?limit=20",
      "/api/bff/api/public/clubs/alpha/browse/notes/sessions?limit=20",
      "/api/bff/api/public/clubs/alpha/browse/notes/feed?limit=20",
      "/api/bff/api/public/clubs/alpha/browse/archive?limit=20",
    ]);
  });

  it("rejects guest response keys outside the server allowlist", () => {
    expect(
      GuestBrowseShellSchema.safeParse({
        ...shell,
        navigation: { ...shell.navigation, mySpace: "PREVIEW" },
      }).success,
    ).toBe(false);
  });
});
