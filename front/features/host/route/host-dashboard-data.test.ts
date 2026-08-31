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

const selector = {
  currentMeeting: {
    sessionId: "session-7",
    selection: "OPEN" as const,
    scheduleSeenAvailability: "AVAILABLE" as const,
  },
};

const detail = {
  sessionId: "session-7",
  sessionNumber: 7,
  title: "No.7 모임",
  bookTitle: "테스트 책",
  bookAuthor: "테스트 저자",
  bookLink: null,
  bookImageUrl: null,
  locationLabel: "온라인",
  meetingUrl: null,
  meetingPasscode: null,
  date: "2026-09-01",
  startTime: "20:00",
  endTime: "22:00",
  questionDeadlineAt: "2026-08-31T14:59:00Z",
  visibility: "MEMBER" as const,
  publication: null,
  state: "OPEN" as const,
  scheduleRevision: 3,
  scheduleSeenAvailability: "AVAILABLE" as const,
  scheduleSeenSummary: { currentCount: 1, staleCount: 0, unseenCount: 1, eligibleCount: 2 },
  versions: {
    sessionRevision: 4,
    scheduleRevision: 3,
    exposureRevision: 2,
    participantSetRevision: 2,
    recordDraftRevision: null,
    liveRecordRevision: null,
    publicationRevision: 0,
  },
  attendanceSnapshotId: "attendance-snapshot-7",
  attendees: [],
  feedbackDocument: { uploaded: false, fileName: null, uploadedAt: null },
};

const closingStatus = {
  schema: "host.session_closing_status.v1" as const,
  session: {
    sessionId: "session-7",
    sessionNumber: 7,
    bookTitle: "테스트 책",
    meetingDate: "2026-09-01",
    state: "OPEN" as const,
    recordVisibility: "MEMBER" as const,
    sessionRevision: 4,
    participantSetRevision: 2,
    attendanceSnapshotId: "attendance-snapshot-7",
  },
  overall: { state: "NOT_STARTED" as const, label: "마감 전", primaryAction: "CLOSE_SESSION" as const },
  checklist: [],
  evidence: {
    summaryPublished: false,
    highlightCount: 0,
    oneLinerCount: 0,
    feedbackDocumentState: "MISSING" as const,
    latestNotificationEvent: null,
    publicRecordHref: null,
    memberReflectionHref: null,
  },
};

const recordAttention = {
  items: [],
  nextCursor: null,
  summary: { needsAttentionCount: 0, incompletePublishedCount: 0, draftCount: 0 },
};

const clubOperations = {
  schema: "host.club_operations_snapshot.v1" as const,
  generatedAt: "2026-08-30T00:00:00Z",
  club: { clubId: "club-1", slug: "reading-sai", name: "독서 사이" },
  readiness: { state: "READY", blockingReasons: [], nextAction: null },
  sessionProgress: {
    upcomingCount: 1,
    currentOpenCount: 1,
    closedCount: 0,
    publishedRecordCount: 0,
    incompleteRecordCount: 0,
  },
  aiUsage: {
    activeJobs: 0,
    failedRecentJobs: 0,
    staleCandidates: 0,
    costEstimateUsd: "0.00",
    state: "IDLE",
    priorFailedJobs7d: 0,
  },
};

const notificationHealth = { pending: 0, failed: 0, dead: 0, sentLast24h: 1, latestFailures: [] };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

function loaderArgs(url = "https://readmates.test/clubs/reading-sai/app/host") {
  return {
    request: new Request(url),
    params: { clubSlug: "reading-sai" },
  } as unknown as LoaderFunctionArgs;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function fetchMockFor(handlers: Record<string, unknown>) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    for (const [pattern, body] of Object.entries(handlers)) {
      if (url === pattern || url.includes(pattern)) {
        if (body instanceof Error) return Promise.reject(body);
        if (body instanceof Response) return Promise.resolve(body);
        return Promise.resolve(jsonResponse(body));
      }
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

function successHandlers() {
  return {
    "/api/bff/api/auth/me": hostAuth,
    "/api/bff/api/host/operating-room/current": selector,
    "/api/bff/api/host/sessions/session-7/closing-status": closingStatus,
    "/api/bff/api/host/sessions/session-7": detail,
    "/api/bff/api/host/sessions?mode=record&needsAttention=true&limit=7": recordAttention,
    "/api/bff/api/host/club-operations": clubOperations,
    "/api/bff/api/host/notifications/summary": notificationHealth,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preserveLocationSuffix", () => {
  it("appends the source search and hash to the destination", () => {
    expect(preserveLocationSuffix(
      "https://readmates.test/app/host?from=mail#board",
      "/app/host/sessions/open-1",
    )).toBe("/app/host/sessions/open-1?from=mail#board");
  });
});

describe("hostDashboardLoaderFactory", () => {
  it("finishes scoped host auth before starting the operating-room selector", async () => {
    const auth = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return auth.promise;
      const body = Object.entries(successHandlers()).find(([pattern]) => url.includes(pattern))?.[1];
      return body === undefined
        ? Promise.reject(new Error(`Unexpected URL: ${url}`))
        : Promise.resolve(jsonResponse(body));
    });
    vi.stubGlobal("fetch", fetchMock);

    const loading = hostDashboardLoaderFactory(createTestQueryClient())(loaderArgs());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/bff/api/auth/me?clubSlug=reading-sai");

    auth.resolve(jsonResponse(hostAuth));
    await loading;
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      "/api/bff/api/host/operating-room/current?clubSlug=reading-sai",
    );
  });

  it("returns an explicit empty operating room without dependent requests", async () => {
    const fetchMock = fetchMockFor({
      "/api/bff/api/auth/me": hostAuth,
      "/api/bff/api/host/operating-room/current": { currentMeeting: null },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await hostDashboardLoaderFactory(createTestQueryClient())(loaderArgs());

    expect(result).toEqual({
      operatingRoom: { currentMeeting: null },
      currentMeeting: null,
      closingStatus: { state: "absent" },
      recordAttention: { state: "absent" },
      clubOperations: { state: "absent" },
      notificationHealth: { state: "absent" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the server-owned selection and fetches its exact detail with URL club scope", async () => {
    const fetchMock = fetchMockFor(successHandlers());
    vi.stubGlobal("fetch", fetchMock);

    const result = await hostDashboardLoaderFactory(createTestQueryClient())(loaderArgs());

    expect(result).toMatchObject({
      operatingRoom: selector,
      currentMeeting: { sessionId: "session-7", scheduleSeenAvailability: "AVAILABLE" },
      closingStatus: { state: "ready", data: closingStatus },
      recordAttention: { state: "ready", data: recordAttention },
      clubOperations: { state: "ready", data: clubOperations },
      notificationHealth: { state: "ready", data: notificationHealth },
    });
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain("/api/bff/api/host/sessions/session-7?clubSlug=reading-sai");
    expect(urls.every((url) => url.includes("clubSlug=reading-sai"))).toBe(true);
    expect(urls.some((url) => url.includes("mode=meeting"))).toBe(false);
    expect(urls.some((url) => url.includes("/api/host/dashboard"))).toBe(false);
  });

  it("starts all optional sources in parallel once the server returns sessionId", async () => {
    const optional = deferred<Response>();
    const optionalPaths = ["/closing-status", "mode=record", "/club-operations", "/notifications/summary"];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return Promise.resolve(jsonResponse(hostAuth));
      if (url.includes("/operating-room/current")) return Promise.resolve(jsonResponse(selector));
      if (url.includes("/host/sessions/session-7?") && !url.includes("closing-status")) {
        return Promise.resolve(jsonResponse(detail));
      }
      if (optionalPaths.some((path) => url.includes(path))) return optional.promise;
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const loading = hostDashboardLoaderFactory(createTestQueryClient())(loaderArgs());
    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(optionalPaths.every((path) => urls.some((url) => url.includes(path)))).toBe(true);
    });

    optional.resolve(jsonResponse({}));
    await loading;
  });

  it("captures one optional failure without blanking successful optional data", async () => {
    const fetchMock = fetchMockFor({
      ...successHandlers(),
      "/api/bff/api/host/sessions/session-7/closing-status": jsonResponse(
        { message: "closing unavailable" },
        503,
      ),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await hostDashboardLoaderFactory(createTestQueryClient())(loaderArgs());

    expect(result.closingStatus).toEqual({
      state: "failed",
      error: { message: "마감 상태를 불러오지 못했습니다.", retryable: true },
    });
    expect(result.recordAttention).toMatchObject({ state: "ready", data: recordAttention });
    expect(result.clubOperations).toMatchObject({ state: "ready", data: clubOperations });
    expect(result.notificationHealth).toMatchObject({ state: "ready", data: notificationHealth });
  });

  it("keeps selected-detail failure as a route error", async () => {
    const fetchMock = fetchMockFor({
      ...successHandlers(),
      "/api/bff/api/host/sessions/session-7": jsonResponse({ message: "detail unavailable" }, 503),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(hostDashboardLoaderFactory(createTestQueryClient())(loaderArgs())).rejects.toMatchObject({
      status: 503,
    });
  });
});
