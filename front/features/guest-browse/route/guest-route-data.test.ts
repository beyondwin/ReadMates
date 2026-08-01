import { afterEach, describe, expect, it, vi } from "vitest";
import { loadClubAppAudience, scopedGuestRouteLoader } from "./club-app-audience-loader";
import { guestArchiveLoader, guestCurrentSessionLoader, guestHomeLoader, guestNotesLoader } from "./guest-route-data";
import { guestWidgetError } from "./guest-route-data";
import { ReadmatesApiError } from "@/shared/api/errors";

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

const inactiveAuth = {
  ...anonymousAuth,
  authenticated: true,
  userId: "former-member",
  membershipId: "former-membership",
  clubId: "former-club",
  email: "former@example.com",
  displayName: "지난 멤버",
  accountName: "지난 멤버",
  role: "MEMBER",
  membershipStatus: "INACTIVE",
  approvalState: "INACTIVE",
};

const activeAuth = {
  ...inactiveAuth,
  membershipStatus: "ACTIVE",
  approvalState: "APPROVED",
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
  it("bounds Retry-After guidance from public rate-limit errors", () => {
    const response = new Response("", { status: 429, headers: { "Retry-After": "99999" } });
    const error = new ReadmatesApiError({ code: "RATE_LIMITED", message: "slow", status: 429, fallback: false }, response);
    expect(guestWidgetError(error, Date.now())).toEqual({ status: 429, retryAfterSeconds: 3600 });
  });
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

  it("loads the public shell for an authenticated guest-equivalent membership", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(inactiveAuth))
      .mockResolvedValueOnce(jsonResponse(shell));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadClubAppAudience({ params: { clubSlug: "alpha" } })).resolves.toMatchObject({
      audience: "GUEST",
      auth: inactiveAuth,
      club: shell,
    });
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/bff/api/auth/me?clubSlug=alpha",
      "/api/bff/api/public/clubs/alpha/browse",
    ]);
  });

  it("does not import a protected child loader for any GUEST audience", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(inactiveAuth))
      .mockResolvedValueOnce(jsonResponse(shell));
    const importProtectedLoader = vi.fn(async () => async () => ({ protected: true }));
    vi.stubGlobal("fetch", fetchMock);

    const loader = scopedGuestRouteLoader(importProtectedLoader);

    await expect(loader({ params: { clubSlug: "alpha" } } as never)).resolves.toEqual({ guestRoute: true });
    expect(importProtectedLoader).not.toHaveBeenCalled();
  });

  it("turns a guest child loader failure into public route data without changing the member loader path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(anonymousAuth))
      .mockResolvedValueOnce(jsonResponse(shell));
    vi.stubGlobal("fetch", fetchMock);
    const protectedLoader = vi.fn(async () => async () => ({ member: true }));
    const guestLoader = vi.fn(async () => { throw new Response("busy", { status: 429 }); });

    await expect(scopedGuestRouteLoader(protectedLoader, guestLoader)({ params: { clubSlug: "alpha" } } as never)).resolves.toEqual({ guestRoute: true, guestFailure: { status: 429 } });
    expect(protectedLoader).not.toHaveBeenCalled();
  });

  it("rethrows guest 404 and arbitrary child failures into the normal route boundary", async () => {
    const protectedLoader = vi.fn(async () => async () => ({ member: true }));
    for (const failure of [new Response("missing", { status: 404 }), new Error("programming failure")]) {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(anonymousAuth)).mockResolvedValueOnce(jsonResponse(shell));
      vi.stubGlobal("fetch", fetchMock);
      await expect(scopedGuestRouteLoader(protectedLoader, async () => { throw failure; })({ params: { clubSlug: "alpha" } } as never)).rejects.toBe(failure);
      vi.unstubAllGlobals();
    }
  });

  it("turns only a guest shell 429/5xx into public retry data and preserves auth failures", async () => {
    const protectedLoader = vi.fn(async () => async () => ({ member: true }));
    for (const [status, headers, expected] of [
      [429, { "Retry-After": "0" }, { status: 429, retryAfterSeconds: 0 }],
      [503, {}, { status: 503 }],
    ] as const) {
      const shellFailure = vi.fn().mockResolvedValueOnce(jsonResponse(anonymousAuth)).mockResolvedValueOnce(new Response("unavailable", { status, headers }));
      vi.stubGlobal("fetch", shellFailure);
      await expect(scopedGuestRouteLoader(protectedLoader)({ params: { clubSlug: "alpha" } } as never)).resolves.toEqual({ guestRoute: true, guestFailure: expected });
      vi.unstubAllGlobals();
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("auth", { status: 503 })));
    await expect(scopedGuestRouteLoader(protectedLoader)({ params: { clubSlug: "alpha" } } as never)).rejects.toBeInstanceOf(ReadmatesApiError);
  });

  it("rethrows a guest shell 404 instead of converting it into public retry data", async () => {
    const shellNotFound = new Response("missing", { status: 404 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(anonymousAuth)).mockResolvedValueOnce(shellNotFound));

    await expect(scopedGuestRouteLoader(async () => async () => ({ member: true }))({ params: { clubSlug: "alpha" } } as never)).rejects.toMatchObject({ status: 404 });
  });

  it("keeps an active member on the protected loader branch", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(activeAuth));
    vi.stubGlobal("fetch", fetchMock);
    const protectedLoader = vi.fn(async () => async () => ({ member: true }));

    await expect(scopedGuestRouteLoader(protectedLoader)({ params: { clubSlug: "alpha" } } as never)).resolves.toEqual({ member: true });
    expect(protectedLoader).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent audience reads for the same navigation request only", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(anonymousAuth))
      .mockResolvedValueOnce(jsonResponse(shell));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://readmates.local/clubs/alpha/app/feedback/s1");

    const [parentAccess, childAccess] = await Promise.all([
      loadClubAppAudience({ params: { clubSlug: "alpha" }, request }),
      loadClubAppAudience({ params: { clubSlug: "alpha" }, request }),
    ]);

    expect(parentAccess).toBe(childAccess);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("keeps successful home widgets visible when another public widget is rate limited", async () => {
    const fetchMock = vi.fn((path: string) => {
      if (path.includes("/sessions/current")) return Promise.resolve(jsonResponse(currentSession));
      if (path.includes("/upcoming")) return Promise.resolve(new Response("slow down", { status: 429 }));
      return Promise.resolve(jsonResponse({ items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", authorName: "이름", authorShortName: "이", avatarKey: "book", kind: "HIGHLIGHT", text: "문장" }], nextCursor: null }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await guestHomeLoader({ params: { clubSlug: "alpha" } });

    expect(data.current.currentSession?.bookTitle).toBe("책");
    expect(data.recentNotes.items).toHaveLength(1);
    expect(data.upcoming.items).toEqual([]);
    expect(data.widgetErrors?.upcoming?.status).toBe(429);
  });
});
