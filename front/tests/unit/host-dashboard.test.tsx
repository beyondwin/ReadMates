import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, type LoaderFunctionArgs } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostDashboardActions } from "@/features/host/route/host-dashboard-actions";
import HostDashboard from "@/features/host/ui/host-dashboard";
import {
  hostDashboardLoaderFactory,
  hostInvitationsLoaderFactory,
  hostMembersLoaderFactory,
  hostSessionEditorLoaderFactory,
} from "@/features/host";
import { QueryClient } from "@tanstack/react-query";
import type {
  CurrentSessionResponse,
  HostDashboardResponse,
  HostNotificationSummary,
  HostSessionListPage,
  HostSessionListItem,
} from "@/features/host/api/host-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { hostSessionDetailContractFixture } from "./api-contract-fixtures";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.pushState({}, "", "/");
});

const dashboard: HostDashboardResponse = {
  rsvpPending: 3,
  checkinMissing: 4,
  publishPending: 1,
  feedbackPending: 2,
};

const emptyDashboard: HostDashboardResponse = {
  rsvpPending: 0,
  checkinMissing: 0,
  publishPending: 0,
  feedbackPending: 0,
};

const notificationSummary = {
  pending: 2,
  failed: 1,
  dead: 1,
  sentLast24h: 5,
  latestFailures: [
    {
      id: "notification-failed-1",
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      recipientEmail: "member@example.com",
      attemptCount: 3,
      updatedAt: "2026-04-28T10:30:00Z",
    },
  ],
} satisfies HostNotificationSummary;

const emptyNotificationSummary = {
  pending: 0,
  failed: 0,
  dead: 0,
  sentLast24h: 0,
  latestFailures: [],
};

const hostAuth: AuthMeResponse = {
  authenticated: true,
  userId: "user-host",
  membershipId: "membership-host",
  clubId: "club-1",
  email: "host@example.com",
  displayName: "김호스트",
  accountName: "우",
  role: "HOST",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
};

const memberAuth: AuthMeResponse = {
  ...hostAuth,
  userId: "user-member",
  membershipId: "membership-member",
  email: "member@example.com",
  displayName: "이멤버",
  accountName: "멤",
  role: "MEMBER",
};

const anonymousAuth: AuthMeResponse = {
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

const current: CurrentSessionResponse = {
  currentSession: {
    sessionId: "session-7",
    sessionNumber: 7,
    title: "7회차 모임 · 테스트 책",
    bookTitle: "테스트 책",
    bookAuthor: "테스트 저자",
    bookLink: "https://example.com/books/test-book",
    bookImageUrl: "https://example.com/covers/test-book.jpg",
    date: "2026-05-20",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    meetingUrl: "https://meet.google.com/readmates-host",
    meetingPasscode: "hostpass",
    questionDeadlineAt: "2026-05-19T14:59:00Z",
    myRsvpStatus: "GOING",
    myCheckin: {
      readingProgress: 62,
    },
    myQuestions: [],
    myOneLineReview: null,
    myLongReview: null,
    board: {
      questions: [
        {
          priority: 1,
          text: "테스트 질문",
          draftThought: null,
          authorName: "안멤버1",
          authorShortName: "멤버1",
          avatarKey: "banana-green-book",
        },
        {
          priority: 2,
          text: "두 번째 질문",
          draftThought: null,
          authorName: "김호스트",
          authorShortName: "우",
          avatarKey: "cloud-green-book",
        },
      ],
      longReviews: [
        {
          authorName: "안멤버1",
          authorShortName: "멤버1",
          avatarKey: "banana-green-book",
          body: "호스트 화면 계약용 서평",
        },
      ],
    },
    attendees: [
      {
        membershipId: "membership-host",
        avatarKey: "cloud-green-book",
        displayName: "김호스트",
        accountName: "우",
        role: "HOST",
        rsvpStatus: "GOING",
        attendanceStatus: "UNKNOWN",
      },
      {
        membershipId: "membership-member",
        avatarKey: "banana-green-book",
        displayName: "안멤버1",
        accountName: "멤버1",
        role: "MEMBER",
        rsvpStatus: "NO_RESPONSE",
        attendanceStatus: "UNKNOWN",
      },
    ],
  },
};

const noCurrent: CurrentSessionResponse = {
  currentSession: null,
};

const hostSessions = [
  {
    sessionId: "session-7",
    sessionNumber: 7,
    title: "7회차 · 테스트 책",
    bookTitle: "테스트 책",
    bookAuthor: "테스트 저자",
    bookImageUrl: null,
    date: "2026-05-20",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    state: "OPEN",
    visibility: "MEMBER",
  },
  {
    sessionId: "session-8",
    sessionNumber: 8,
    title: "8회차 · 다음 책",
    bookTitle: "다음 책",
    bookAuthor: "다음 저자",
    bookImageUrl: null,
    date: "2026-06-17",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "강남",
    state: "DRAFT",
    visibility: "HOST_ONLY",
  },
] satisfies HostSessionListItem[];

const twoDraftHostSessions = [
  {
    sessionId: "session-8",
    sessionNumber: 8,
    title: "8회차 · 다음 책",
    bookTitle: "다음 책",
    bookAuthor: "다음 저자",
    bookImageUrl: null,
    date: "2026-06-17",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "강남",
    state: "DRAFT",
    visibility: "HOST_ONLY",
  },
  {
    sessionId: "session-9",
    sessionNumber: 9,
    title: "9회차 · 그 다음 책",
    bookTitle: "그 다음 책",
    bookAuthor: "다음 다음 저자",
    bookImageUrl: null,
    date: "2026-07-15",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    state: "DRAFT",
    visibility: "MEMBER",
  },
] satisfies HostSessionListItem[];

const noopHostDashboardActions = {
  updateCurrentSessionParticipation: vi.fn(async () => undefined),
  updateSessionAccessScope: vi.fn(async () => undefined),
  openSession: vi.fn(async () => undefined),
  loadHostSessions: vi.fn(async () => ({ items: [], nextCursor: null })),
} satisfies HostDashboardActions;

type HostDashboardProps = Parameters<typeof HostDashboard>[0];

function HostDashboardForTest({
  actions,
  hostSessions: testHostSessions = [],
  ...props
}: Omit<HostDashboardProps, "actions" | "hostSessions"> & {
  actions?: HostDashboardActions;
  hostSessions?: HostSessionListPage | HostSessionListItem[];
}) {
  const hostSessionPage = Array.isArray(testHostSessions)
    ? { items: testHostSessions, nextCursor: null }
    : testHostSessions;

  return <HostDashboard {...props} hostSessions={hostSessionPage} actions={actions ?? noopHostDashboardActions} />;
}

function getDesktopView(container: HTMLElement) {
  const desktop = container.querySelector(".rm-host-dashboard-desktop");
  expect(desktop).not.toBeNull();
  return within(desktop as HTMLElement);
}

function getMobileView(container: HTMLElement) {
  const mobile = container.querySelector(".rm-host-dashboard-mobile");
  expect(mobile).not.toBeNull();
  return within(mobile as HTMLElement);
}

function expectDisabledActionInViews(
  desktop: ReturnType<typeof within>,
  mobile: ReturnType<typeof within>,
  name: string | RegExp,
) {
  expect(desktop.getByRole("button", { name })).toBeDisabled();
  expect(mobile.getByRole("button", { name })).toBeDisabled();
}

function authResponse(auth: AuthMeResponse) {
  return new Response(JSON.stringify(auth), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function deferredAction() {
  let resolve!: () => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<void>((resolver, rejecter) => {
    resolve = resolver;
    reject = rejecter;
  });

  return { promise, resolve, reject };
}

async function expectLoaderRedirect(runLoader: () => Promise<unknown>, location: string) {
  try {
    await runLoader();
    throw new Error("Expected loader to redirect.");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(302);
    expect((error as Response).headers.get("Location")).toBe(location);
  }
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function hostDashboardLoaderForTest(args?: LoaderFunctionArgs) {
  return hostDashboardLoaderFactory(createTestQueryClient())(args);
}

function hostSessionEditorLoaderForTest() {
  return hostSessionEditorLoaderFactory(createTestQueryClient())({
    params: { sessionId: "session-7" },
    request: new Request("https://readmates.test/app/host/sessions/session-7/edit"),
  } as LoaderFunctionArgs);
}

const hostLoaderCases: Array<[string, () => Promise<unknown>, string]> = [
  ["dashboard", () => hostDashboardLoaderForTest(), "/login"],
  ["members", () => hostMembersLoaderFactory(new QueryClient())(), "/login"],
  ["invitations", () => hostInvitationsLoaderFactory(new QueryClient())(), "/login"],
  ["session editor", hostSessionEditorLoaderForTest, "/login?returnTo=%2Fapp%2Fhost%2Fsessions%2Fsession-7%2Fedit"],
];

const clubScopedHostDashboardLoader = hostDashboardLoaderForTest;

describe("HostDashboard", () => {
  it.each(hostLoaderCases)("redirects anonymous users before calling %s host endpoints", async (_name, runLoader, location) => {
    const fetchMock = vi.fn().mockResolvedValue(authResponse(anonymousAuth));
    vi.stubGlobal("fetch", fetchMock);

    await expectLoaderRedirect(runLoader, location);

    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/me", expect.objectContaining({ cache: "no-store" }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/bff/api/host/"))).toBe(false);
  });

  it.each(hostLoaderCases)("redirects non-host users before calling %s host endpoints", async (_name, runLoader) => {
    const fetchMock = vi.fn().mockResolvedValue(authResponse(memberAuth));
    vi.stubGlobal("fetch", fetchMock);

    await expectLoaderRedirect(runLoader, "/app");

    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/me", expect.objectContaining({ cache: "no-store" }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/bff/api/host/"))).toBe(false);
  });

  it.each([
    ["viewer", { ...hostAuth, membershipStatus: "VIEWER", approvalState: "ACTIVE" } satisfies AuthMeResponse],
    ["suspended", { ...hostAuth, membershipStatus: "SUSPENDED", approvalState: "ACTIVE" } satisfies AuthMeResponse],
  ])("redirects %s hosts with active-looking approval before calling host endpoints", async (_state, auth) => {
    for (const [, runLoader] of hostLoaderCases) {
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        void input;
        return Promise.resolve(authResponse(auth));
      });
      vi.stubGlobal("fetch", fetchMock);

      await expectLoaderRedirect(runLoader, "/app");

      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/me", expect.objectContaining({ cache: "no-store" }));
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/bff/api/host/"))).toBe(false);
      expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/bff/api/sessions/current")).toBe(false);
      vi.unstubAllGlobals();
    }
  });

  it("allows active hosts to load the host dashboard endpoints", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(authResponse(hostAuth));
      }

      if (url === "/api/bff/api/sessions/current") {
        return Promise.resolve(new Response(JSON.stringify(current), { status: 200 }));
      }

      if (url === "/api/bff/api/host/dashboard") {
        return Promise.resolve(new Response(JSON.stringify(dashboard), { status: 200 }));
      }

      if (url === "/api/bff/api/host/sessions?limit=50") {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }

      if (url === "/api/bff/api/host/notifications/summary") {
        return Promise.resolve(new Response(JSON.stringify(notificationSummary), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({ message: "unexpected request" }), { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(hostDashboardLoaderForTest()).resolves.toEqual({
      current,
      data: dashboard,
      hostSessions: { items: [], nextCursor: null },
      notifications: notificationSummary,
      clubOperations: null,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/me", expect.objectContaining({ cache: "no-store" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/sessions/current", expect.objectContaining({ cache: "no-store" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/dashboard", expect.objectContaining({ cache: "no-store" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions?limit=50", expect.objectContaining({ cache: "no-store" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/notifications/summary",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("shows the host next action reading-loop state and bridge copy", () => {
    const { container } = render(
      <HostDashboardForTest
        data={{
          ...emptyDashboard,
          currentSessionMissingMembers: [
            {
              membershipId: "membership-new",
              displayName: "새 멤버",
              email: "new-member@example.com",
            },
          ],
        }}
        current={current}
        hostSessions={hostSessions}
      />,
    );

    const desktop = getDesktopView(container);

    expect(desktop.getByText("호스트 준비 필요")).toBeInTheDocument();
    expect(
      desktop.getByText("호스트가 세션 정보, 멤버 상태, 공개 범위, 운영 대기 항목을 먼저 닫아야 합니다."),
    ).toBeInTheDocument();
  });

  it("does not use stale scoped browser location for unscoped host auth and data loaders", async () => {
    window.history.pushState({}, "", "/clubs/reading-sai/app/host");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(authResponse(hostAuth));
      }

      if (url === "/api/bff/api/sessions/current") {
        return Promise.resolve(jsonResponse(current));
      }

      if (url === "/api/bff/api/host/dashboard") {
        return Promise.resolve(jsonResponse(dashboard));
      }

      if (url === "/api/bff/api/host/sessions?limit=50") {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }

      if (url === "/api/bff/api/host/notifications/summary") {
        return Promise.resolve(jsonResponse(notificationSummary));
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(hostDashboardLoaderForTest({ params: {}, request: new Request("https://readmates.test/app/host") } as LoaderFunctionArgs))
      .resolves.toEqual({ current, data: dashboard, hostSessions: { items: [], nextCursor: null }, notifications: notificationSummary, clubOperations: null });

    expect(fetchMock.mock.calls.map(([url]) => String(url)).every((url) => !url.includes("clubSlug="))).toBe(true);
  });

  it("passes club slug context when loading a club-scoped host dashboard", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") {
        return Promise.resolve(authResponse(hostAuth));
      }

      if (url === "/api/bff/api/sessions/current?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse(current));
      }

      if (url === "/api/bff/api/host/dashboard?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse(dashboard));
      }

      if (url === "/api/bff/api/host/sessions?limit=50&clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: "cursor-1" }));
      }

      if (url === "/api/bff/api/host/notifications/summary?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse(notificationSummary));
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      clubScopedHostDashboardLoader({
        params: { clubSlug: "reading-sai" },
        request: new Request("https://readmates.test/clubs/reading-sai/app/host"),
      } as LoaderFunctionArgs),
    ).resolves.toEqual({
      current,
      data: dashboard,
      hostSessions: { items: [], nextCursor: "cursor-1" },
      notifications: notificationSummary,
      clubOperations: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/auth/me?clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/dashboard?clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("loads host session list for the dashboard", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/bff/api/auth/me") return Promise.resolve(authResponse(hostAuth));
      if (url === "/api/bff/api/sessions/current") return Promise.resolve(jsonResponse(current));
      if (url === "/api/bff/api/host/dashboard") return Promise.resolve(jsonResponse(dashboard));
      if (url === "/api/bff/api/host/sessions?limit=50") return Promise.resolve(jsonResponse({ items: [], nextCursor: "cursor-1" }));
      if (url === "/api/bff/api/host/notifications/summary") return Promise.resolve(jsonResponse(notificationSummary));
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await hostDashboardLoaderForTest();

    expect(data.hostSessions).toEqual({ items: [], nextCursor: "cursor-1" });
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions?limit=50", expect.objectContaining({}));
  });

  it("seeds host dashboard query data into the shared query client", async () => {
    const client = createTestQueryClient();
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") return Promise.resolve(authResponse(hostAuth));
      if (url === "/api/bff/api/sessions/current?clubSlug=reading-sai") return Promise.resolve(jsonResponse(current));
      if (url === "/api/bff/api/host/dashboard?clubSlug=reading-sai") return Promise.resolve(jsonResponse(dashboard));
      if (url === "/api/bff/api/host/sessions?limit=50&clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({ items: hostSessions, nextCursor: null }));
      }
      if (url === "/api/bff/api/host/notifications/summary?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse(notificationSummary));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await hostDashboardLoaderFactory(client)({
      params: { clubSlug: "reading-sai" },
      request: new Request("https://readmates.test/clubs/reading-sai/app/host"),
    } as LoaderFunctionArgs);

    const { hostCurrentSessionQuery, hostDashboardQuery, hostSessionListQuery } = await import(
      "@/features/host/queries/host-session-queries"
    );
    const { hostNotificationSummaryQuery } = await import("@/features/host/queries/host-notification-queries");

    expect(client.getQueryData(hostCurrentSessionQuery({ clubSlug: "reading-sai" }).queryKey)).toEqual(current);
    expect(client.getQueryData(hostDashboardQuery({ clubSlug: "reading-sai" }).queryKey)).toEqual(dashboard);
    expect(client.getQueryData(hostSessionListQuery({ limit: 50 }, { clubSlug: "reading-sai" }).queryKey)).toEqual({
      items: hostSessions,
      nextCursor: null,
    });
    expect(client.getQueryData(hostNotificationSummaryQuery({ clubSlug: "reading-sai" }).queryKey)).toEqual(notificationSummary);

    const fetchedUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(fetchedUrls.some((url) => url.includes("limit=50") && url.includes("clubSlug=reading-sai"))).toBe(true);
  });

  it("seeds host session editor detail and manual dispatches into the shared query client", async () => {
    const client = createTestQueryClient();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") return Promise.resolve(authResponse(hostAuth));
      if (url === "/api/bff/api/host/sessions/session-7?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse(hostSessionDetailContractFixture));
      }
      if (
        url.includes("/api/bff/api/host/notifications/manual/dispatches") &&
        url.includes("sessionId=session-7") &&
        url.includes("limit=20") &&
        url.includes("clubSlug=reading-sai")
      ) {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }
      if (url === "/api/bff/api/host/sessions/session-7/record-editor?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({
          sessionId: "session-7",
          liveRevision: 0,
          liveSessionUpdatedAt: "2026-06-01T00:00:00Z",
          liveSnapshot: {
            schema: "readmates-session-record:v1",
            visibility: "HOST_ONLY",
            publicationSummary: "",
            highlights: [],
            oneLineReviews: [],
            feedbackDocument: { fileName: "", title: "", markdown: "" },
          },
          draft: null,
          draftLiveBaseStale: false,
          validationSummary: { valid: true, issues: [] },
        }));
      }
      if (
        url.includes("/api/bff/api/host/sessions/session-7/history") &&
        url.includes("limit=30") &&
        url.includes("clubSlug=reading-sai")
      ) {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await hostSessionEditorLoaderFactory(client)({
      params: { clubSlug: "reading-sai", sessionId: "session-7" },
      request: new Request("https://readmates.test/clubs/reading-sai/app/host/sessions/session-7/edit"),
    } as LoaderFunctionArgs);

    const { hostSessionDetailQuery, hostSessionManualDispatchesQuery } = await import(
      "@/features/host/queries/host-session-queries"
    );
    expect(client.getQueryData(hostSessionDetailQuery("session-7", { clubSlug: "reading-sai" }).queryKey)).toEqual(
      hostSessionDetailContractFixture,
    );
    expect(client.getQueryData(
      hostSessionManualDispatchesQuery(
        { sessionId: "session-7", page: { limit: 20 } },
        { clubSlug: "reading-sai" },
      ).queryKey,
    )).toEqual({ items: [], nextCursor: null });
  });

  it("loads host notification status for the dashboard", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/bff/api/auth/me") return Promise.resolve(authResponse(hostAuth));
      if (url === "/api/bff/api/sessions/current") return Promise.resolve(jsonResponse(current));
      if (url === "/api/bff/api/host/dashboard") return Promise.resolve(jsonResponse(dashboard));
      if (url === "/api/bff/api/host/sessions?limit=50") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      if (url === "/api/bff/api/host/notifications/summary") return Promise.resolve(jsonResponse(notificationSummary));
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await hostDashboardLoaderForTest();

    expect(data).toMatchObject({ notifications: notificationSummary });
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/notifications/summary", expect.objectContaining({}));
  });

  it("keeps host dashboard loader usable when notification status is temporarily unavailable", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/bff/api/auth/me") return Promise.resolve(authResponse(hostAuth));
      if (url === "/api/bff/api/sessions/current") return Promise.resolve(jsonResponse(current));
      if (url === "/api/bff/api/host/dashboard") return Promise.resolve(jsonResponse(dashboard));
      if (url === "/api/bff/api/host/sessions?limit=50") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      if (url === "/api/bff/api/host/notifications/summary") {
        return Promise.resolve(new Response(JSON.stringify({ message: "notification status unavailable" }), { status: 503 }));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(hostDashboardLoaderForTest()).resolves.toEqual({
      current,
      data: dashboard,
      hostSessions: { items: [], nextCursor: null },
      notifications: emptyNotificationSummary,
      clubOperations: null,
    });
  });

  it("does not hide notification status authorization failures", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/bff/api/auth/me") return Promise.resolve(authResponse(hostAuth));
      if (url === "/api/bff/api/sessions/current") return Promise.resolve(jsonResponse(current));
      if (url === "/api/bff/api/host/dashboard") return Promise.resolve(jsonResponse(dashboard));
      if (url === "/api/bff/api/host/sessions?limit=50") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      if (url === "/api/bff/api/host/notifications/summary") {
        return Promise.resolve(new Response(JSON.stringify({ message: "forbidden" }), { status: 403 }));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(hostDashboardLoaderForTest()).rejects.toThrow("이 작업을 수행할 권한이 없습니다.");
  });

  it("renders notification status without full recipient email addresses", () => {
    const props = {
      data: dashboard,
      notifications: notificationSummary,
    } as HostDashboardProps & { notifications: typeof notificationSummary };
    const { container } = render(<HostDashboardForTest {...props} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getByRole("heading", { name: "알림 발송" })).toBeInTheDocument();
    expect(desktop.getByText("최근 24시간 5건")).toBeInTheDocument();
    expect(desktop.getByText("대기 2")).toBeInTheDocument();
    expect(desktop.getByText("실패 1")).toBeInTheDocument();
    expect(desktop.getByText("중단 1")).toBeInTheDocument();
    expect(desktop.getByText("FEEDBACK_DOCUMENT_PUBLISHED")).toBeInTheDocument();
    expect(desktop.getByText("m***@example.com")).toBeInTheDocument();
    expect(mobile.getByText("최근 24시간 5건")).toBeInTheDocument();
    expect(screen.queryByText("member@example.com")).not.toBeInTheDocument();

    for (const view of [desktop, mobile]) {
      const eventType = view.getByText("FEEDBACK_DOCUMENT_PUBLISHED");
      const failure = eventType.closest("li") as HTMLElement;
      const attempt = failure.lastElementChild as HTMLElement;

      expect(eventType).toHaveClass("mono");
      expect(attempt).toHaveTextContent("3회 시도");
      expect(attempt).not.toHaveClass("mono");
      expect(Array.from(attempt.querySelectorAll(".ledger-number")).map((value) => value.textContent))
        .toEqual(["3"]);
    }
  });

  it("renders the mobile notification summary as an equal metric rail without nested cards", () => {
    const { container } = render(
      <HostDashboardForTest
        current={current}
        data={dashboard}
        notifications={notificationSummary}
      />,
    );
    const mobile = getMobileView(container);
    const region = mobile.getByRole("region", { name: "알림 발송" });

    expect(region).toHaveClass("rm-host-mobile-notifications");
    expect(region).not.toHaveClass("m-card-quiet");
    const metrics = region.querySelector(".rm-host-mobile-notifications__metrics");
    expect(metrics?.querySelectorAll(":scope > div")).toHaveLength(3);
    expect(within(region).getByText("대기").parentElement).toHaveTextContent("2");
    expect(within(region).getByText("실패").parentElement).toHaveTextContent("1");
    expect(within(region).getByText("중단").parentElement).toHaveTextContent("1");
    expect(region.querySelector(".badge")).toBeNull();
    expect(
      within(region).getByRole("link", { name: "알림 발송 장부 열기" }),
    ).toHaveAttribute("href", "/app/host/notifications");
  });

  it("links to the host notification operations page", () => {
    render(
      <HostDashboardForTest current={current} data={dashboard} notifications={notificationSummary} />,
    );

    expect(screen.getByRole("link", { name: "알림 발송 장부" })).toHaveAttribute("href", "/app/host/notifications");
  });

  it("renders upcoming session management on desktop and mobile", () => {
    const { container } = render(
      <HostDashboardForTest auth={hostAuth} current={noCurrent} data={dashboard} hostSessions={hostSessions} />,
    );

    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getByRole("heading", { name: "앞으로 읽을 세션" })).toBeInTheDocument();
    expect(desktop.getByText("다음 책")).toBeInTheDocument();
    const desktopUpcomingRow = desktop.getByText("다음 책").closest(".row-between");
    expect(desktopUpcomingRow).not.toBeNull();
    expect(within(desktopUpcomingRow as HTMLElement).getByText("게스트 접근")).toBeInTheDocument();
    expect(within(desktopUpcomingRow as HTMLElement).getByText("호스트 전용")).toBeInTheDocument();
    expect(within(desktopUpcomingRow as HTMLElement).getByRole("button", { name: /게스트 공개/ })).toHaveTextContent("게스트 공개");
    expect(desktop.getByRole("button", { name: /현재로 시작/ })).toBeInTheDocument();
    expect(mobile.getByRole("heading", { name: "예정 세션", exact: true })).toBeInTheDocument();
    expect(mobile.getByRole("heading", { name: "운영 흐름", exact: true })).toBeInTheDocument();
    expect(mobile.getByText("다음 책")).toBeInTheDocument();
    const mobileUpcomingCard = mobile.getByText("다음 책").closest(".m-card-quiet");
    expect(mobileUpcomingCard).not.toBeNull();
    expect(within(mobileUpcomingCard as HTMLElement).getByText("게스트 접근")).toBeInTheDocument();
    expect(within(mobileUpcomingCard as HTMLElement).getByText("호스트 전용")).toBeInTheDocument();
    expect(within(mobileUpcomingCard as HTMLElement).getByRole("button", { name: /게스트 공개/ })).toHaveTextContent("게스트 공개");
  });

  it("loads and appends more upcoming sessions from the host sessions cursor", async () => {
    const user = userEvent.setup();
    const nextSession = twoDraftHostSessions[1];
    const actions = {
      ...noopHostDashboardActions,
      loadHostSessions: vi.fn(async () => ({ items: [nextSession], nextCursor: null })),
    } satisfies HostDashboardActions;
    const { container } = render(
      <HostDashboardForTest
        auth={hostAuth}
        current={noCurrent}
        data={dashboard}
        hostSessions={{ items: [hostSessions[1]], nextCursor: "cursor-1" }}
        actions={actions}
      />,
    );
    const desktop = getDesktopView(container);
    const upcomingSection = desktop.getByRole("heading", { name: "앞으로 읽을 세션" }).closest("section");
    expect(upcomingSection).not.toBeNull();

    await user.click(within(upcomingSection as HTMLElement).getByRole("button", { name: "더 보기" }));

    expect(actions.loadHostSessions).toHaveBeenCalledWith({ limit: 50, cursor: "cursor-1" });
    expect(within(upcomingSection as HTMLElement).getByText("다음 책")).toBeInTheDocument();
    expect(await within(upcomingSection as HTMLElement).findByText("그 다음 책")).toBeInTheDocument();
    expect(within(upcomingSection as HTMLElement).queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
  });

  it("names the upcoming-session pagination operation while desktop and mobile are pending", async () => {
    const user = userEvent.setup();
    let resolvePage!: (page: HostSessionListPage) => void;
    const pendingPage = new Promise<HostSessionListPage>((resolve) => {
      resolvePage = resolve;
    });
    const actions = {
      ...noopHostDashboardActions,
      loadHostSessions: vi.fn(() => pendingPage),
    } satisfies HostDashboardActions;
    const { container } = render(
      <HostDashboardForTest
        auth={hostAuth}
        current={noCurrent}
        data={dashboard}
        hostSessions={{ items: [hostSessions[1]], nextCursor: "cursor-1" }}
        actions={actions}
      />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    await user.click(desktop.getByRole("button", { name: "더 보기" }));

    expect(desktop.getByRole("status")).toHaveTextContent(
      "예정 세션을 더 불러오는 중",
    );
    expect(mobile.getByRole("status")).toHaveTextContent(
      "예정 세션을 더 불러오는 중",
    );
    expect(
      desktop.getByRole("button", { name: "예정 세션을 더 불러오는 중" }),
    ).toBeDisabled();
    expect(
      mobile.getByRole("button", { name: "예정 세션을 더 불러오는 중" }),
    ).toBeDisabled();

    resolvePage({ items: [], nextCursor: null });
    await waitFor(() => {
      expect(
        desktop.queryByRole("button", { name: "예정 세션을 더 불러오는 중" }),
      ).not.toBeInTheDocument();
      expect(desktop.queryByRole("status")).not.toBeInTheDocument();
      expect(mobile.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("drops the appended host sessions buffer when the base list reference advances", async () => {
    const user = userEvent.setup();
    const nextSession = twoDraftHostSessions[1];
    const actions = {
      ...noopHostDashboardActions,
      loadHostSessions: vi.fn(async () => ({ items: [nextSession], nextCursor: null })),
    } satisfies HostDashboardActions;
    const initialBase: HostSessionListPage = { items: [twoDraftHostSessions[0]], nextCursor: "cursor-1" };
    const { container, rerender } = render(
      <HostDashboardForTest
        auth={hostAuth}
        current={noCurrent}
        data={dashboard}
        hostSessions={initialBase}
        actions={actions}
      />,
    );
    const desktop = getDesktopView(container);
    const upcomingSection = desktop.getByRole("heading", { name: "앞으로 읽을 세션" }).closest("section") as HTMLElement;

    await user.click(within(upcomingSection).getByRole("button", { name: "더 보기" }));
    expect(await within(upcomingSection).findByText("그 다음 책")).toBeInTheDocument();

    // Simulate a base-list refetch (deep-equal-but-fresh page): TanStack Query's structuralSharing
    // keeps the same content but the host-dashboard route hands a fresh page reference to the UI.
    // Per spec: appended rows must not survive the refetch.
    const refreshedBase: HostSessionListPage = { items: [twoDraftHostSessions[0]], nextCursor: "cursor-1" };
    rerender(
      <HostDashboardForTest
        auth={hostAuth}
        current={noCurrent}
        data={dashboard}
        hostSessions={refreshedBase}
        actions={actions}
      />,
    );

    const refreshedDesktop = getDesktopView(container);
    const refreshedSection = refreshedDesktop.getByRole("heading", { name: "앞으로 읽을 세션" }).closest("section") as HTMLElement;
    expect(within(refreshedSection).queryByText("그 다음 책")).not.toBeInTheDocument();
    expect(within(refreshedSection).getByText("다음 책")).toBeInTheDocument();
  });

  it("calls guest-access and open actions from upcoming session rows", async () => {
    const user = userEvent.setup();
    const actions = {
      ...noopHostDashboardActions,
      updateSessionAccessScope: vi.fn(async () => undefined),
      openSession: vi.fn(async () => undefined),
    } satisfies HostDashboardActions;

    render(
      <HostDashboardForTest auth={hostAuth} current={noCurrent} data={dashboard} hostSessions={hostSessions} actions={actions} />,
    );

    await user.click(screen.getAllByRole("button", { name: /게스트 공개/ })[0]);
    expect(actions.updateSessionAccessScope).toHaveBeenCalledWith("session-8", { accessScope: "GUEST_READABLE" });

    await user.click(screen.getAllByRole("button", { name: /현재로 시작/ })[0]);
    expect(actions.openSession).toHaveBeenCalledWith("session-8");
  });

  it("disables upcoming guest-access action while pending and flips local state on success", async () => {
    const user = userEvent.setup();
    const visibilityUpdate = deferredAction();
    const actions = {
      ...noopHostDashboardActions,
      updateSessionAccessScope: vi.fn(() => visibilityUpdate.promise),
    } satisfies HostDashboardActions;
    const { container } = render(
      <HostDashboardForTest auth={hostAuth} current={current} data={dashboard} hostSessions={hostSessions} actions={actions} />,
    );
    const desktop = getDesktopView(container);

    await user.click(desktop.getByRole("button", { name: /게스트 공개/ }));

    expect(desktop.getByRole("button", { name: /게스트 접근을 저장하는 중/ })).toBeDisabled();
    expect(actions.updateSessionAccessScope).toHaveBeenCalledWith("session-8", { accessScope: "GUEST_READABLE" });

    visibilityUpdate.resolve();

    await waitFor(() => expect(desktop.getByRole("button", { name: /호스트 전용/ })).toBeInTheDocument());
    expect(desktop.queryByRole("button", { name: /게스트 접근을 저장하는 중/ })).not.toBeInTheDocument();
  });

  it("disables all upcoming controls while an upcoming action is pending", async () => {
    const user = userEvent.setup();
    const visibilityUpdate = deferredAction();
    const actions = {
      ...noopHostDashboardActions,
      updateSessionAccessScope: vi.fn(() => visibilityUpdate.promise),
    } satisfies HostDashboardActions;
    const { container } = render(
      <HostDashboardForTest
        auth={hostAuth}
        current={noCurrent}
        data={dashboard}
        hostSessions={twoDraftHostSessions}
        actions={actions}
      />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    await user.click(desktop.getByRole("button", { name: /게스트 공개/ }));

    const desktopRemaining = desktop.getByText("그 다음 책").closest(".row-between");
    const mobileRemaining = mobile.getByText("그 다음 책").closest(".m-card-quiet");
    expect(desktopRemaining).not.toBeNull();
    expect(mobileRemaining).not.toBeNull();
    expect(within(desktopRemaining as HTMLElement).getByRole("button", { name: /호스트 전용/ })).toBeDisabled();
    expect(within(desktopRemaining as HTMLElement).getByRole("button", { name: /현재로 시작/ })).toBeDisabled();
    expect(within(mobileRemaining as HTMLElement).getByRole("button", { name: /호스트 전용/ })).toBeDisabled();
    expect(within(mobileRemaining as HTMLElement).getByRole("button", { name: /현재로 시작/ })).toBeDisabled();

    visibilityUpdate.resolve();

    await waitFor(() =>
      expect(within(desktopRemaining as HTMLElement).getByRole("button", { name: /호스트 전용/ })).toBeEnabled(),
    );
  });

  it("disables upcoming open action while pending and removes the draft on success", async () => {
    const user = userEvent.setup();
    const openSession = deferredAction();
    const actions = {
      ...noopHostDashboardActions,
      openSession: vi.fn(() => openSession.promise),
    } satisfies HostDashboardActions;
    const { container } = render(
      <HostDashboardForTest auth={hostAuth} current={noCurrent} data={dashboard} hostSessions={hostSessions} actions={actions} />,
    );
    const desktop = getDesktopView(container);

    await user.click(desktop.getByRole("button", { name: /현재로 시작/ }));

    expect(desktop.getByRole("button", { name: /세션을 시작하는 중/ })).toBeDisabled();
    expect(actions.openSession).toHaveBeenCalledWith("session-8");
    expect(screen.getAllByText("다음 책")).toHaveLength(2);

    openSession.resolve();

    await waitFor(() => expect(screen.queryByText("다음 책")).not.toBeInTheDocument());
    expect(screen.getAllByText("아직 등록된 예정 세션이 없습니다.")).toHaveLength(2);
  });

  it("disables remaining upcoming open actions after a draft opens successfully", async () => {
    const user = userEvent.setup();
    const openSession = deferredAction();
    const actions = {
      ...noopHostDashboardActions,
      openSession: vi.fn(() => openSession.promise),
    } satisfies HostDashboardActions;
    const { container } = render(
      <HostDashboardForTest
        auth={hostAuth}
        current={noCurrent}
        data={emptyDashboard}
        hostSessions={twoDraftHostSessions}
        actions={actions}
      />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    await user.click(desktop.getAllByRole("button", { name: /현재로 시작/ })[0]);

    expect(actions.openSession).toHaveBeenCalledWith("session-8");

    openSession.resolve();

    await waitFor(() => expect(desktop.queryByText("다음 책")).not.toBeInTheDocument());
    expect(desktop.getByText("그 다음 책")).toBeInTheDocument();
    expect(desktop.queryByRole("button", { name: /현재로 시작/ })).not.toBeInTheDocument();
    expect(desktop.queryByRole("button", { name: /현재 세션 있음/ })).not.toBeInTheDocument();
    expect(mobile.queryByRole("button", { name: /현재 세션 있음/ })).not.toBeInTheDocument();
    expect(desktop.getByText("현재 열린 세션이 있어 예정 세션을 바로 시작할 수 없습니다.")).toBeInTheDocument();
    expect(mobile.getByText("현재 열린 세션이 있어 예정 세션을 바로 시작할 수 없습니다.")).toBeInTheDocument();
    expect(screen.getAllByText("현재 세션을 시작했습니다.")).toHaveLength(2);

    expect(actions.openSession).toHaveBeenCalledTimes(1);
  });

  it("summarizes blocked upcoming start once while a current session exists", () => {
    const actions = {
      ...noopHostDashboardActions,
      openSession: vi.fn(async () => undefined),
    } satisfies HostDashboardActions;
    const { container } = render(
      <HostDashboardForTest auth={hostAuth} current={current} data={dashboard} hostSessions={hostSessions} actions={actions} />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);
    const desktopUpcoming = desktop.getByRole("heading", { name: "앞으로 읽을 세션" }).closest("section");
    const mobileUpcoming = mobile.getByRole("heading", { name: "예정 세션", exact: true }).closest("section");

    expect(desktop.queryByRole("button", { name: /현재 세션 있음/ })).not.toBeInTheDocument();
    expect(mobile.queryByRole("button", { name: /현재 세션 있음/ })).not.toBeInTheDocument();
    expect(within(desktopUpcoming as HTMLElement).getByText("현재 열린 세션이 있어 예정 세션을 바로 시작할 수 없습니다.")).toBeInTheDocument();
    expect(within(mobileUpcoming as HTMLElement).getByText("현재 열린 세션이 있어 예정 세션을 바로 시작할 수 없습니다.")).toBeInTheDocument();
    expect(within(desktopUpcoming as HTMLElement).getByRole("button", { name: /게스트 공개|호스트 전용/ })).toBeEnabled();
    expect(within(mobileUpcoming as HTMLElement).getByRole("button", { name: /게스트 공개|호스트 전용/ })).toBeEnabled();

    expect(actions.openSession).not.toHaveBeenCalled();
  });

  it("renders compact upcoming session identity on desktop and mobile", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 25, 0, 0, 0));

    const { container } = render(
      <HostDashboardForTest auth={hostAuth} current={current} data={dashboard} hostSessions={hostSessions} />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);
    const desktopUpcoming = desktop.getByRole("heading", { name: "앞으로 읽을 세션" }).closest("section");
    const desktopRow = within(desktopUpcoming as HTMLElement).getByText("다음 책").closest(".row-between");
    const mobileCard = mobile.getByText("다음 책").closest(".m-card-quiet");

    expect(within(desktopRow as HTMLElement).getByRole("group", { name: "No.08 · D-53" })).toBeInTheDocument();
    expect(within(desktopRow as HTMLElement).getByRole("group", { name: "No.08 · D-53" })).toHaveClass(
      "rm-session-identity--muted",
    );
    expect(within(desktopRow as HTMLElement).getByText("No.08")).toHaveClass("rm-session-identity__chip");
    expect(within(desktopRow as HTMLElement).getByText("No.08")).not.toHaveClass("rm-session-identity__number", "rm-state--pending");
    expect(within(desktopRow as HTMLElement).getByText("D-53")).toHaveClass("rm-session-identity__chip");
    expect(within(desktopRow as HTMLElement).getByText("D-53")).not.toHaveClass("rm-state--pending");
    expect(within(desktopRow as HTMLElement).queryByText("예정 세션")).not.toBeInTheDocument();
    expect(within(desktopRow as HTMLElement).queryByText("예정")).not.toBeInTheDocument();
    expect(within(mobileCard as HTMLElement).getByRole("group", { name: "No.08 · D-53" })).toBeInTheDocument();
    expect(within(mobileCard as HTMLElement).getByText("예정")).toHaveClass("rm-host-upcoming-mobile__timing--upcoming");
  });

  it("shows a compact error when an upcoming action fails", async () => {
    const user = userEvent.setup();
    const actions = {
      ...noopHostDashboardActions,
      updateSessionAccessScope: vi.fn(async () => {
        throw new Error("visibility failed");
      }),
    } satisfies HostDashboardActions;

    render(<HostDashboardForTest auth={hostAuth} current={current} data={dashboard} hostSessions={hostSessions} actions={actions} />);

    await user.click(screen.getAllByRole("button", { name: /게스트 공개/ })[0]);

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      "게스트 접근을 저장하지 못했습니다. 기존 접근 범위는 유지됩니다. 다시 시도해 주세요.",
      "게스트 접근을 저장하지 못했습니다. 기존 접근 범위는 유지됩니다. 다시 시도해 주세요.",
    ]);
    expect(screen.getAllByRole("button", { name: /게스트 공개/ })[0]).toBeEnabled();
  });

  it("keeps mobile upcoming cards operational with visibility, open, and edit controls", () => {
    const { container } = render(
      <HostDashboardForTest auth={hostAuth} current={noCurrent} data={dashboard} hostSessions={hostSessions} />,
    );
    const mobile = getMobileView(container);
    const nextBookCard = mobile.getByText("다음 책").closest(".m-card-quiet");

    expect(nextBookCard).not.toBeNull();
    const visibilityButton = within(nextBookCard as HTMLElement).getByRole("button", { name: /게스트 공개/ });
    const openButton = within(nextBookCard as HTMLElement).getByRole("button", { name: /현재로 시작/ });
    const editLink = within(nextBookCard as HTMLElement).getByRole("link", { name: "날짜 수정 · 다음 책" });
    const actionGroup = openButton.closest(".rm-host-upcoming-mobile__actions");
    expect(actionGroup).toBe(visibilityButton.closest(".rm-host-upcoming-mobile__actions"));
    expect(visibilityButton).toBeInTheDocument();
    expect(editLink).toHaveClass("btn-primary");
    expect(actionGroup?.querySelectorAll(".btn-primary")).toHaveLength(1);
    expect(editLink).toHaveAttribute("href", "/app/host/sessions/session-8/edit");
  });

  it("does not double the top rule on the first desktop upcoming session row", () => {
    const { container } = render(
      <HostDashboardForTest auth={hostAuth} current={noCurrent} data={dashboard} hostSessions={twoDraftHostSessions} />,
    );
    const desktop = getDesktopView(container);
    const upcomingSection = desktop.getByRole("heading", { name: "앞으로 읽을 세션" }).closest("section");
    expect(upcomingSection).not.toBeNull();

    const firstRow = within(upcomingSection as HTMLElement).getByText("다음 책").closest(".row-between");
    const secondRow = within(upcomingSection as HTMLElement).getByText("그 다음 책").closest(".row-between");

    expect(firstRow).not.toBeNull();
    expect(secondRow).not.toBeNull();
    expect((firstRow as HTMLElement).style.borderTop).not.toBe("1px solid var(--line-soft)");
    expect((secondRow as HTMLElement).style.borderTop).toBe("1px solid var(--line-soft)");
  });

  it("shows no-session fallbacks when there is no current session and no pending work", () => {
    const { container } = render(<HostDashboardForTest current={{ currentSession: null }} data={emptyDashboard} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getByRole("heading", { name: "오늘의 운영" })).toBeInTheDocument();
    expect(desktop.getByText("열린 세션이 없습니다")).toBeInTheDocument();
    expect(mobile.getByText("열린 세션 없음")).toBeInTheDocument();
    expect(desktop.getByRole("heading", { name: "처리 대기 원장" })).toBeInTheDocument();
    expect(mobile.getByText("확인할 항목 없음")).toBeInTheDocument();
    expect(desktop.getAllByText("안정").length).toBeGreaterThanOrEqual(4);
    const desktopNewSessionLinks = desktop.getAllByRole("link", { name: "세션 문서 만들기" });
    const mobileNewSessionLinks = mobile.getAllByRole("link", { name: "세션 문서 만들기" });
    expect(desktopNewSessionLinks.length).toBeGreaterThanOrEqual(1);
    expect(mobileNewSessionLinks.length).toBeGreaterThanOrEqual(1);
    expect(desktopNewSessionLinks.every((link) => link.getAttribute("href") === "/app/host/sessions/new")).toBe(true);
    expect(mobileNewSessionLinks.every((link) => link.getAttribute("href") === "/app/host/sessions/new")).toBe(true);
    expect(desktop.getByText("책, 일정, 장소를 등록하면 멤버의 RSVP와 질문 작성 흐름이 열립니다.")).toBeInTheDocument();
    expect(mobile.getByText("책, 일정, 장소를 등록하면 멤버의 RSVP와 질문 작성 흐름이 열립니다.")).toBeInTheDocument();
    expect(desktop.getByRole("heading", { name: "다음 세션과 운영 흐름" })).toBeInTheDocument();
    expect(mobile.getByRole("heading", { name: "예정 세션", exact: true })).toBeInTheDocument();
    expect(mobile.getByRole("heading", { name: "운영 흐름", exact: true })).toBeInTheDocument();
  });

  it("keeps host dashboard CTAs inside the scoped app route", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/host"]}>
        <HostDashboardForTest current={{ currentSession: null }} data={emptyDashboard} />
      </MemoryRouter>,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(
      desktop
        .getAllByRole("link", { name: "세션 문서 만들기" })
        .every((link) => link.getAttribute("href") === "/clubs/reading-sai/app/host/sessions/new"),
    ).toBe(true);
    expect(
      mobile
        .getAllByRole("link", { name: "세션 문서 만들기" })
        .every((link) => link.getAttribute("href") === "/clubs/reading-sai/app/host/sessions/new"),
    ).toBe(true);
  });

  it("shows a member-status empty state when the current session has no attendees", () => {
    const { container } = render(
      <HostDashboardForTest
        current={{
          currentSession: current.currentSession ? { ...current.currentSession, attendees: [] } : null,
        }}
        data={dashboard}
      />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getByText("참석 현황 준비 중")).toBeInTheDocument();
    expect(mobile.getByText("참석 현황 준비 중")).toBeInTheDocument();
  });

  it("renders API dashboard counts and the new session action", () => {
    const { container } = render(<HostDashboardForTest data={dashboard} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getByText("모임 운영")).toBeInTheDocument();
    expect(desktop.getByText("모임 운영")).not.toHaveClass("ledger-number");
    expect(desktop.getByRole("heading", { name: "오늘의 운영" })).toBeInTheDocument();
    expect(desktop.getByRole("heading", { name: "처리 대기 원장" })).toBeInTheDocument();
    expect(desktop.getByRole("heading", { name: "다음 세션과 운영 흐름" })).toBeInTheDocument();
    expect(desktop.getByRole("heading", { name: "운영 도구" })).toBeInTheDocument();
    expect(mobile.getByText(/호스트님, 우선 행동부터 확인하세요/)).toBeInTheDocument();
    expect(mobile.getByText("모임 운영")).toBeInTheDocument();
    expect(mobile.getByRole("heading", { name: "지금 처리할 일" })).toBeInTheDocument();
    expect(mobile.getByText("확인할 운영 항목")).toBeInTheDocument();
    expect(mobile.getByRole("heading", { name: "예정 세션", exact: true })).toBeInTheDocument();
    expect(mobile.getByRole("heading", { name: "운영 흐름", exact: true })).toBeInTheDocument();
    expect(mobile.getByText("운영 도구")).toBeInTheDocument();
    expect(desktop.getByText("RSVP 미응답")).toBeInTheDocument();
    expect(desktop.getByText("RSVP 미응답")).not.toHaveClass("ledger-number");
    expect(desktop.getByText("진행률 미작성")).toBeInTheDocument();
    expect(desktop.getByText("공개·피드백 대기")).toBeInTheDocument();
    expect(desktop.getAllByText("수정 필요 회차").length).toBeGreaterThan(0);
    expect(desktop.getAllByText("3").length).toBeGreaterThan(0);
    expect(desktop.getByText("4")).toBeInTheDocument();
    for (const value of container.querySelectorAll(".ledger-number")) {
      expect(value.textContent).toMatch(/(?:No\.\d+|\d)/);
    }
    expect(desktop.queryByRole("link", { name: "+ 새 세션" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "멤버 초대" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "멤버 화면으로" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "멤버 화면으로" })).not.toBeInTheDocument();
    expect(screen.queryByText("Host operations")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
    expect(screen.queryByText("Upcoming")).not.toBeInTheDocument();
    expect(screen.queryByText("Operation timeline")).not.toBeInTheDocument();
    expect(screen.queryByText("Member status")).not.toBeInTheDocument();
    expect(screen.queryByText("Quick actions")).not.toBeInTheDocument();
    expect(screen.queryByText("리마인더 가능")).not.toBeInTheDocument();
    expect(screen.queryByText("리마인더 발송 가능")).not.toBeInTheDocument();
    expect(screen.queryByText("발송 대기")).not.toBeInTheDocument();
    expect(screen.queryByText("개인 피드백 HTML 리포트 등록")).not.toBeInTheDocument();
  });

  it("does not style pending feedback documents as completed", () => {
    const { container } = render(<HostDashboardForTest current={current} data={{ ...emptyDashboard, feedbackPending: 1 }} />);
    const desktop = getDesktopView(container);
    const feedbackMetric = desktop.getByText("공개·피드백 대기").closest(".rm-host-ledger__metric");

    expect(feedbackMetric).not.toBeNull();
    expect(within(feedbackMetric as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(feedbackMetric as HTMLElement).getByText("확인 필요")).toBeInTheDocument();
    expect(feedbackMetric).toHaveClass("rm-host-ledger__metric--accent");
  });

  it("keeps aggregate publication next actions out of the current session editor", () => {
    const { container } = render(
      <HostDashboardForTest current={current} data={{ ...emptyDashboard, publishPending: 1 }} />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);
    const desktopAction = desktop.getByRole("link", { name: "세션 기록에서 선택" });
    const mobileAction = mobile.getByRole("link", { name: "세션 기록에서 선택", hidden: true });

    expect(desktopAction).toHaveAttribute("href", "/app/host/sessions?needsAttention=true");
    expect(mobileAction).toHaveAttribute("href", "/app/host/sessions?needsAttention=true");
  });

  it("keeps current-session status as a single badge independent from aggregate publication backlog", () => {
    vi.setSystemTime(new Date(2026, 4, 17, 12));

    const { container } = render(<HostDashboardForTest current={current} data={{ ...emptyDashboard, publishPending: 7 }} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);
    const desktopSessionCard = desktop.getByRole("heading", { name: "테스트 책" }).closest("article");
    const mobileSessionCard = mobile.getByRole("heading", { name: "테스트 책" }).closest("article");
    const mobileSessionSection = mobile.getByRole("heading", { name: "현재 세션" }).closest("section");

    expect(desktopSessionCard).not.toBeNull();
    expect(mobileSessionCard).not.toBeNull();
    expect(mobileSessionSection).not.toBeNull();

    expect(within(desktopSessionCard as HTMLElement).queryByText("상태")).not.toBeInTheDocument();
    expect(within(mobileSessionCard as HTMLElement).queryByText("상태")).not.toBeInTheDocument();
    expect(within(desktopSessionCard as HTMLElement).getAllByText("준비 중")).toHaveLength(1);
    expect(within(mobileSessionSection as HTMLElement).getAllByText("준비 중")).toHaveLength(1);
    expect(within(desktopSessionCard as HTMLElement).queryByText("공개")).not.toBeInTheDocument();
    expect(within(mobileSessionCard as HTMLElement).queryByText("공개")).not.toBeInTheDocument();
  });

  it("keeps aggregate feedback next actions out of the current session editor", () => {
    const { container } = render(
      <HostDashboardForTest current={current} data={{ ...emptyDashboard, feedbackPending: 1 }} />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);
    const desktopAction = desktop.getByRole("link", { name: "세션 기록에서 선택" });
    const mobileAction = mobile.getByRole("link", { name: "세션 기록에서 선택", hidden: true });

    expect(desktopAction).toHaveAttribute("href", "/app/host/sessions?needsAttention=true");
    expect(mobileAction).toHaveAttribute("href", "/app/host/sessions?needsAttention=true");
  });

  it("keeps aggregate publication and feedback quick actions out of the current session editor", () => {
    const { container } = render(
      <HostDashboardForTest current={current} data={{ ...emptyDashboard, publishPending: 1, feedbackPending: 1 }} />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);
    const currentEditHref = "/app/host/sessions/session-7/edit";

    expect(desktop.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "피드백 문서 등록" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "피드백 문서 등록" })).not.toBeInTheDocument();
    expectDisabledActionInViews(desktop, mobile, /공개 요약 편집.*공개 대기 건수는 여러 세션을 합산한 값/);
    expectDisabledActionInViews(desktop, mobile, /피드백 문서 등록.*피드백 문서 대기 건수는 여러 세션을 합산한 값/);
    expect(desktop.getByRole("link", { name: "참석 확정 마감" })).toHaveAttribute("href", currentEditHref);
    expect(mobile.getByRole("link", { name: "참석 확정 마감" })).toHaveAttribute("href", currentEditHref);
  });

  it("shows current-session missing member alerts when the dashboard payload includes them", () => {
    const { container } = render(
      <HostDashboardForTest
        current={current}
        data={{
          ...dashboard,
          currentSessionMissingMemberCount: 1,
          currentSessionMissingMembers: [{ membershipId: "membership-new", displayName: "새 멤버", email: "new@example.com" }],
        }}
      />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getByText("새 멤버 1명이 현재 세션에 아직 없습니다.")).toBeInTheDocument();
    expect(desktop.getByText("new@example.com")).toBeInTheDocument();
    expect(desktop.getByRole("button", { name: "이번 세션에 추가" })).toBeInTheDocument();
    expect(desktop.getByRole("button", { name: "다음 세션부터" })).toBeInTheDocument();
    expect(mobile.getByText("새 멤버 1명이 현재 세션에 아직 없습니다.")).toBeInTheDocument();
    expect(mobile.getByRole("button", { name: "이번 세션에 추가" })).toBeInTheDocument();
    expect(mobile.getByRole("button", { name: "다음 세션부터" })).toBeInTheDocument();
  });

  it("adds a missing member to the current session from the dashboard alert", async () => {
    const user = userEvent.setup();
    const actions = {
      ...noopHostDashboardActions,
      updateCurrentSessionParticipation: vi.fn(async () => undefined),
    } satisfies HostDashboardActions;
    const { container } = render(
      <HostDashboardForTest
        current={current}
        data={{
          ...dashboard,
          currentSessionMissingMemberCount: 1,
          currentSessionMissingMembers: [{ membershipId: "membership-new", displayName: "새 멤버", email: "new@example.com" }],
        }}
        actions={actions}
      />,
    );
    const desktop = getDesktopView(container);

    await user.click(desktop.getByRole("button", { name: "이번 세션에 추가" }));

    expect(actions.updateCurrentSessionParticipation).toHaveBeenCalledWith("membership-new", "add");
    await waitFor(() => expect(screen.queryByText("새 멤버 1명이 현재 세션에 아직 없습니다.")).not.toBeInTheDocument());
  });

  it("marks a missing member for next session from the dashboard alert", async () => {
    const user = userEvent.setup();
    const actions = {
      ...noopHostDashboardActions,
      updateCurrentSessionParticipation: vi.fn(async () => undefined),
    } satisfies HostDashboardActions;
    const { container } = render(
      <HostDashboardForTest
        current={current}
        data={{
          ...dashboard,
          currentSessionMissingMemberCount: 1,
          currentSessionMissingMembers: [{ membershipId: "membership-new", displayName: "새 멤버", email: "new@example.com" }],
        }}
        actions={actions}
      />,
    );
    const desktop = getDesktopView(container);

    await user.click(desktop.getByRole("button", { name: "다음 세션부터" }));

    expect(actions.updateCurrentSessionParticipation).toHaveBeenCalledWith("membership-new", "remove");
    await waitFor(() => expect(screen.queryByText("새 멤버 1명이 현재 세션에 아직 없습니다.")).not.toBeInTheDocument());
  });

  it("renders the mobile host operations flow in the baseline order", () => {
    vi.setSystemTime(new Date(2026, 4, 17, 12));

    const { container } = render(<HostDashboardForTest auth={hostAuth} current={current} data={dashboard} />);
    const mobile = getMobileView(container);
    const mobileSessionCard = mobile.getByRole("article", { name: "현재 세션 요약" });

    expect(mobile.getByText("5월 17일 (일)")).toBeInTheDocument();
    expect(mobile.getByText("모임 운영")).toBeInTheDocument();
    expect(mobile.getByText("김호스트님, 우선 행동부터 확인하세요.")).toBeInTheDocument();

    const orderedLabels = [
      "지금 처리할 일",
      "현재 세션",
      "확인할 운영 항목",
      "예정 세션",
      "운영 흐름",
      "운영 도구",
    ];
    const html = container.querySelector(".rm-host-dashboard-mobile")?.textContent ?? "";
    let cursor = -1;
    for (const label of orderedLabels) {
      const next = html.indexOf(label, cursor + 1);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }

    expect(mobile.getByRole("group", { name: "No.07 · D-3" })).toBeInTheDocument();
    expect(mobile.queryByRole("group", { name: /No.07 · 이번 세션 · 준비 중 · D-3/ })).not.toBeInTheDocument();
    expect(mobile.getByText("2026.05.20 · 20:00 · 온라인")).toBeInTheDocument();
    expect(within(mobileSessionCard).getByRole("link", { name: "세션 문서 열기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/session-7/edit",
    );
    expect(current.currentSession?.myCheckin).not.toHaveProperty("note");
    expect(current.currentSession?.board).not.toHaveProperty("checkins");
    expect(mobile.getByText("질문").parentElement).toHaveTextContent("2/10");
    expect(mobile.getByText("읽기").parentElement).toHaveTextContent("1/2");
    for (const value of container.querySelectorAll(".rm-host-dashboard-mobile__session-metrics dd")) {
      expect(value).toHaveClass("ledger-number");
    }
    const noResponseSummary = Array.from(mobileSessionCard.querySelectorAll("p")).find(
      (paragraph) => paragraph.textContent === "미응답 1명",
    );
    expect(noResponseSummary).toBeDefined();
    expect(noResponseSummary).not.toHaveTextContent("참석 1명");
    expect(mobile.queryByText("김호스트")).not.toBeInTheDocument();
    expect(mobile.queryByText("안멤버1")).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(mobile.getByText("운영 도구").closest("details")).not.toHaveAttribute("open");
  });

  it("keeps secondary mobile ledgers and tools collapsed by default", () => {
    const { container } = render(<HostDashboardForTest auth={hostAuth} current={current} data={dashboard} />);
    const mobile = getMobileView(container);
    const disclosures = container.querySelectorAll(
      ".rm-host-dashboard-mobile details.rm-host-mobile-disclosure",
    );
    const ledger = mobile.getByText("확인할 운영 항목").closest("details");
    const tools = mobile.getByText("운영 도구").closest("details");

    expect(disclosures).toHaveLength(2);
    expect(ledger).not.toHaveAttribute("open");
    expect(tools).not.toHaveAttribute("open");
    expect(within(ledger as HTMLElement).getByText("RSVP 미응답")).toBeInTheDocument();
    expect(
      within(ledger as HTMLElement).getByRole("link", { name: "세션 기록 전체 보기" }),
    ).toHaveAttribute("href", "/app/host/sessions");
    expect(within(tools as HTMLElement).getByText("알림 · 멤버 · 초대 · AI 설정")).toBeInTheDocument();
  });

  it("links the current session action to the host edit page", () => {
    vi.setSystemTime(new Date(2026, 4, 17, 12));

    const { container } = render(<HostDashboardForTest auth={hostAuth} current={current} data={dashboard} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getByRole("group", { name: "No.07 · D-3 · 이번 세션" })).toBeInTheDocument();
    expect(desktop.queryByRole("group", { name: /No.07 · 이번 세션 · 준비 중 · D-3/ })).not.toBeInTheDocument();
    expect(desktop.getByText("2026.05.20 20:00 · 온라인")).toBeInTheDocument();
    expect(desktop.getByText("질문").parentElement).toHaveTextContent("2/10");
    expect(desktop.getByText("읽기").parentElement).toHaveTextContent("1/2");
    for (const value of container.querySelectorAll(".rm-host-current__metrics dd")) {
      expect(value).toHaveClass("ledger-number");
    }
    expect(desktop.getByRole("img", { name: "테스트 책 표지" })).toHaveAttribute(
      "src",
      "https://example.com/covers/test-book.jpg",
    );
    const desktopSessionFooter = container.querySelector(
      ".rm-host-dashboard-desktop .rm-host-current__footer",
    );
    expect(desktopSessionFooter).toHaveTextContent("참석 1명 · 미응답 1명");
    expect(
      Array.from(desktopSessionFooter!.querySelectorAll(".ledger-number")).map((number) => number.textContent),
    ).toEqual(["1", "1"]);
    expect(desktop.queryByText("김호스트")).not.toBeInTheDocument();
    expect(desktop.queryByText("안멤버1")).not.toBeInTheDocument();
    expect(desktop.queryByText("읽는 중")).not.toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "세션 문서 편집" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expect(desktop.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "피드백 문서 등록" })).not.toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "참석 확정 마감" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expect(mobile.getByText("운영 도구").closest("details")).not.toHaveAttribute("open");
    expect(desktop.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("does not complete post-session checklist items from aggregate zero counts", () => {
    const { container } = render(<HostDashboardForTest current={current} data={emptyDashboard} />);
    const desktop = getDesktopView(container);
    const publicationRow = desktop
      .getAllByText("공개 대기 중인 이전 세션이 없습니다.")
      .map((element) => element.closest("li"))
      .find(Boolean);
    const feedbackRow = desktop
      .getAllByText("피드백 문서 등록 대기 중인 이전 세션이 없습니다.")
      .map((element) => element.closest("li"))
      .find(Boolean);

    expect(publicationRow).not.toBeNull();
    expect(within(publicationRow as HTMLElement).getByText("공개 요약과 하이라이트 편집")).toBeInTheDocument();
    expect(within(publicationRow as HTMLElement).getByText("안내")).toBeInTheDocument();
    expect(within(publicationRow as HTMLElement).queryByText("완료")).not.toBeInTheDocument();
    expect(feedbackRow).not.toBeNull();
    expect(within(feedbackRow as HTMLElement).getByText("피드백 문서 등록")).toBeInTheDocument();
    expect(within(feedbackRow as HTMLElement).getByText("안내")).toBeInTheDocument();
    expect(within(feedbackRow as HTMLElement).queryByText("완료")).not.toBeInTheDocument();
  });

  it("encodes session ids in host edit links", () => {
    const encodedCurrent: CurrentSessionResponse = {
      currentSession: {
        ...current.currentSession!,
        sessionId: "session/7?draft=true",
      },
    };

    const { container } = render(<HostDashboardForTest current={encodedCurrent} data={dashboard} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);
    const expectedHref = "/app/host/sessions/session%2F7%3Fdraft%3Dtrue/edit";

    expect(desktop.getByRole("link", { name: "세션 문서 편집" })).toHaveAttribute("href", expectedHref);
    expect(
      within(mobile.getByRole("article", { name: "현재 세션 요약" })).getByRole("link", {
        name: "세션 문서 열기",
      }),
    ).toHaveAttribute("href", expectedHref);
    expect(desktop.getByRole("link", { name: "참석 확정 마감" })).toHaveAttribute("href", expectedHref);
    expect(mobile.getByRole("link", { name: "참석 확정 마감" })).toHaveAttribute("href", expectedHref);
    expect(desktop.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
  });

  it("normalizes negative reading metric counts for current sessions", () => {
    const { container } = render(<HostDashboardForTest current={current} data={{ ...dashboard, checkinMissing: -1 }} />);
    const desktop = getDesktopView(container);

    expect(screen.queryByText("-1명 미작성")).not.toBeInTheDocument();
    expect(desktop.getByText("읽기").parentElement).toHaveTextContent("1/2");
  });
});
