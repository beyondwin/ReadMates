import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import {
  hostDashboardLoaderFactory,
  preserveLocationSuffix,
} from "./host-dashboard-data";

const hostAuth: AuthMeResponse = {
  authenticated: true,
  userId: "user-host",
  membershipId: "membership-host",
  clubId: "club-1",
  email: "host@example.test",
  displayName: "Host",
  accountName: "Host",
  role: "HOST",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
};

const emptyAttention = {
  items: [],
  nextCursor: null,
  summary: {
    needsAttentionCount: 0,
    incompletePublishedCount: 0,
    draftCount: 0,
  },
};

const emptyMeetingPage = {
  items: [],
  nextCursor: null,
  summary: emptyAttention.summary,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
}

function loaderArgs(url = "https://readmates.test/clubs/reading-sai/app/host") {
  return {
    request: new Request(url),
    params: { clubSlug: "reading-sai" },
  } as unknown as LoaderFunctionArgs;
}

function attentionItem(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "closed-1",
    sessionNumber: 12,
    title: "No.12",
    bookTitle: "닫힌 책",
    bookAuthor: "저자",
    bookImageUrl: null,
    date: "2026-04-15",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    state: "CLOSED",
    visibility: "MEMBER",
    recordStatus: "INCOMPLETE",
    needsAttention: true,
    hasDraft: false,
    liveRevision: 1,
    draftRevision: null,
    lastModifiedAt: "2026-04-16T00:00:00Z",
    ...overrides,
  };
}

function fetchMockFor(handlers: Record<string, unknown>) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    for (const [pattern, body] of Object.entries(handlers)) {
      if (url === pattern || url.includes(pattern)) {
        if (body instanceof Error) {
          return Promise.reject(body);
        }
        if (body instanceof Response) {
          return Promise.resolve(body);
        }
        return Promise.resolve(jsonResponse(body));
      }
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preserveLocationSuffix", () => {
  it("appends the source search and hash to the destination", () => {
    expect(
      preserveLocationSuffix(
        "https://readmates.test/app/host?from=mail#board",
        "/app/host/sessions/open-1",
      ),
    ).toBe("/app/host/sessions/open-1?from=mail#board");
  });
});

describe("hostDashboardLoaderFactory", () => {
  it("requests only auth, current, the session list, and attention limit 7", async () => {
    const fetchMock = fetchMockFor({
      "/api/bff/api/auth/me": hostAuth,
      "/api/bff/api/sessions/current": { currentSession: null },
      "/api/bff/api/host/sessions?mode=meeting&limit=50": emptyMeetingPage,
      "/api/bff/api/host/sessions?mode=record&needsAttention=true&limit=7": emptyAttention,
    });
    vi.stubGlobal("fetch", fetchMock);

    await hostDashboardLoaderFactory(createTestQueryClient())(loaderArgs());

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual(expect.arrayContaining([
      "/api/bff/api/auth/me?clubSlug=reading-sai",
      "/api/bff/api/sessions/current?clubSlug=reading-sai",
      "/api/bff/api/host/sessions?mode=meeting&limit=50&clubSlug=reading-sai",
      "/api/bff/api/host/sessions?mode=record&needsAttention=true&limit=7&clubSlug=reading-sai",
    ]));
    expect(urls.some((url) => url.includes("/host/dashboard"))).toBe(false);
    expect(urls.some((url) => url.includes("/host/notifications"))).toBe(false);
    expect(urls.some((url) => url.includes("/host/club-operations"))).toBe(false);
  });

  it("keeps today as the owner when an active meeting exists", async () => {
    const fetchMock = fetchMockFor({
      "/api/bff/api/auth/me": hostAuth,
      "/api/bff/api/sessions/current": { currentSession: null },
      "/api/bff/api/host/sessions?mode=meeting&limit=50": {
        items: [{
          sessionId: "open-1",
          sessionNumber: 8,
          title: "No.8",
          bookTitle: "열린 책",
          bookAuthor: "저자",
          bookImageUrl: null,
          date: "2026-06-11",
          startTime: "20:00",
          endTime: "22:00",
          locationLabel: "온라인",
          state: "OPEN",
          visibility: "MEMBER",
          recordStatus: "NOT_STARTED",
          needsAttention: false,
          hasDraft: false,
          liveRevision: 0,
          draftRevision: null,
          lastModifiedAt: null,
        }],
        nextCursor: null,
        summary: emptyAttention.summary,
      },
      "/api/bff/api/host/sessions?mode=record&needsAttention=true&limit=7": emptyAttention,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await hostDashboardLoaderFactory(createTestQueryClient())(
      loaderArgs("https://readmates.test/clubs/reading-sai/app/host?from=mail#board"),
    );

    expect(result).toMatchObject({
      hostSessions: { items: [expect.objectContaining({ sessionId: "open-1", state: "OPEN" })] },
    });
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/host/dashboard"))).toBe(false);
    expect(urls.some((url) => url.includes("/host/notifications"))).toBe(false);
    expect(urls.some((url) => url.includes("/host/club-operations"))).toBe(false);
  });

  it("keeps scoped today data without redirecting into a draft editor", async () => {
    const fetchMock = fetchMockFor({
      "/api/bff/api/auth/me?clubSlug=reading-sai": hostAuth,
      "/api/bff/api/sessions/current?clubSlug=reading-sai": { currentSession: null },
      "/api/bff/api/host/sessions?mode=meeting&limit=50&clubSlug=reading-sai": {
        items: [{
          sessionId: "draft-1",
          sessionNumber: 9,
          title: "No.9",
          bookTitle: "다음 책",
          bookAuthor: "저자",
          bookImageUrl: null,
          date: "2026-07-02",
          startTime: "20:00",
          endTime: "22:00",
          locationLabel: "온라인",
          state: "DRAFT",
          visibility: "HOST_ONLY",
          recordStatus: "NOT_STARTED",
          needsAttention: false,
          hasDraft: false,
          liveRevision: 0,
          draftRevision: null,
          lastModifiedAt: null,
        }],
        nextCursor: null,
        summary: emptyAttention.summary,
      },
      "/api/bff/api/host/sessions?mode=record&needsAttention=true&limit=7&clubSlug=reading-sai": emptyAttention,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await hostDashboardLoaderFactory(createTestQueryClient())({
      params: { clubSlug: "reading-sai" },
      request: new Request("https://readmates.test/clubs/reading-sai/app/host?tab=prep#top"),
    } as unknown as LoaderFunctionArgs);

    expect(result).toMatchObject({
      hostSessions: { items: [expect.objectContaining({ sessionId: "draft-1", state: "DRAFT" })] },
    });
  });

  it("returns empty-ledger attention data including PUBLISHED without starting discarded fetches", async () => {
    const published = attentionItem({
      sessionId: "published-1",
      sessionNumber: 11,
      bookTitle: "공개된 책",
      state: "PUBLISHED",
      recordStatus: "INCOMPLETE",
    });
    const fetchMock = fetchMockFor({
      "/api/bff/api/auth/me": hostAuth,
      "/api/bff/api/sessions/current": { currentSession: null },
      "/api/bff/api/host/sessions?mode=meeting&limit=50": emptyMeetingPage,
      "/api/bff/api/host/sessions?mode=record&needsAttention=true&limit=7": {
        items: [published],
        nextCursor: "more",
        summary: {
          needsAttentionCount: 4,
          incompletePublishedCount: 1,
          draftCount: 0,
        },
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await hostDashboardLoaderFactory(createTestQueryClient())(loaderArgs());

    expect(result).toMatchObject({
      current: { currentSession: null },
      hostSessions: { items: [], nextCursor: null },
      recordAttention: {
        items: [expect.objectContaining({ sessionId: "published-1", state: "PUBLISHED" })],
        summary: { needsAttentionCount: 4 },
      },
    });
    expect(result).not.toHaveProperty("data");
    expect(result).not.toHaveProperty("notifications");
    expect(result).not.toHaveProperty("clubOperations");
    expect(result).toMatchObject({ attentionError: false });
  });

  it("keeps empty-home data when attention fails instead of crashing the loader", async () => {
    const fetchMock = fetchMockFor({
      "/api/bff/api/auth/me": hostAuth,
      "/api/bff/api/sessions/current": { currentSession: null },
      "/api/bff/api/host/sessions?mode=meeting&limit=50": emptyMeetingPage,
      "/api/bff/api/host/sessions?mode=record&needsAttention=true&limit=7": new Response(
        JSON.stringify({ message: "attention unavailable" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await hostDashboardLoaderFactory(createTestQueryClient())(loaderArgs());

    expect(result).toMatchObject({
      current: { currentSession: null },
      hostSessions: { items: [], nextCursor: null },
      recordAttention: null,
      attentionError: true,
    });
  });
});
