import { afterEach, describe, expect, it, vi } from "vitest";
import { loadClubAppAudience } from "./club-app-audience-loader";
import { guestArchiveLoader, guestCurrentSessionLoader, guestNotesLoader } from "./guest-route-data";

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

const anonymousAuth = {
  authenticated: false,
  userId: null,
  membershipId: null,
  clubId: null,
  email: null,
  displayName: null,
  accountName: null,
  role: null,
  membershipStatus: null,
  approvalState: "ANONYMOUS",
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

describe("guest route loaders", () => {
  it("loads scoped auth and shell without a member redirect", async () => {
    const assign = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(anonymousAuth))
      .mockResolvedValueOnce(jsonResponse(shell));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign, hash: "", pathname: "/clubs/alpha/app", search: "" });

    await expect(loadClubAppAudience({ params: { clubSlug: "alpha" } })).resolves.toMatchObject({ audience: "GUEST", club: shell });

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/bff/api/auth/me?clubSlug=alpha",
      "/api/bff/api/public/clubs/alpha/browse",
    ]);
    expect(assign).not.toHaveBeenCalled();
  });

  it("keeps child guest loaders on browse endpoints only", async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(jsonResponse(path.endsWith("/sessions/current") ? currentSession : { items: [], nextCursor: null })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const args = { params: { clubSlug: "alpha" } };

    await Promise.all([guestCurrentSessionLoader(args), guestNotesLoader(args), guestArchiveLoader(args)]);

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/bff/api/public/clubs/alpha/browse/sessions/current",
      "/api/bff/api/public/clubs/alpha/browse/notes/sessions?limit=20",
      "/api/bff/api/public/clubs/alpha/browse/notes/feed?limit=20",
      "/api/bff/api/public/clubs/alpha/browse/archive?limit=20",
    ]);
    expect(fetchMock.mock.calls.every(([path]) => String(path).includes("/api/public/clubs/alpha/browse"))).toBe(true);
  });
});
