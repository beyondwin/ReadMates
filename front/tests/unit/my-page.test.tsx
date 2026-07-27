import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type CSSProperties, type ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberProfileResponse } from "@/features/archive/api/archive-contracts";
import type { MyPageProfile, NotificationPreferences } from "@/features/archive/model/archive-model";
import type { MyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { myPageLoader } from "@/features/archive/route/my-page-data";
import { MyPageRoute } from "@/features/archive/route/my-page-route";
import MyPage from "@/features/archive/ui/my-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const profile: MyPageProfile = {
  displayName: "샘플 멤버",
  accountName: "sample-member",
  email: "member@example.com",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  clubName: "샘플 독서모임",
  joinedAt: "2026-01",
  sessionCount: 6,
  totalSessionCount: 9,
  completedReadingCount: 4,
  currentSessionId: null,
  recentAttendances: [],
};

const journey: MyJourneyPage = {
  items: [
    {
      sessionId: "session-9",
      sessionNumber: 9,
      bookTitle: "보이지 않는 도시들",
      bookAuthor: "이탈로 칼비노",
      bookImageUrl: null,
      date: "2026-07-22",
      readingProgress: 100,
      questionCount: 2,
      reviewCount: 1,
      feedbackDocument: { available: true, readable: true, lockedReason: null },
    },
  ],
  nextCursor: "next-page",
  summary: {
    attendedSessionCount: 6,
    completedReadingCount: 4,
    questionCount: 11,
    reviewCount: 3,
    readableFeedbackDocumentCount: 1,
  },
};

const notificationPreferences: NotificationPreferences = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: false,
  },
};

function renderMyPage(overrides: Partial<Parameters<typeof MyPage>[0]> = {}) {
  const props: Parameters<typeof MyPage>[0] = {
    data: profile,
    journey,
    LogoutButtonComponent: ({ children }) => <button type="button">{children}</button>,
    onLeaveMembership: async () => undefined,
    notificationPreferences,
    onSaveNotificationPreferences: async (preferences) => preferences,
    onLoadMoreJourney: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return { ...render(<MyPage {...props} />), props };
}

describe("MyPage", () => {
  it("renders the record-first shelf hierarchy and exact personal summary", () => {
    renderMyPage();

    expect(screen.getByRole("heading", { level: 1, name: "나의 서재" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "책별 기록" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3, name: "보이지 않는 도시들" })).toHaveLength(1);
    expect(screen.getByText("참여")).toBeInTheDocument();
    expect(screen.getByText("완독 4/6")).toBeInTheDocument();
    expect(screen.getByText("질문")).toBeInTheDocument();
    expect(screen.getByText("서평")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "계정과 알림" })).not.toBeInTheDocument();
  });

  it("keeps settings in a controlled disclosure after the record surface", async () => {
    const user = userEvent.setup();
    function ControlledPage() {
      const [settingsOpen, setSettingsOpen] = useState(false);
      return <MyPage {...renderProps()} settingsOpen={settingsOpen} onSettingsOpenChange={setSettingsOpen} />;
    }

    render(<ControlledPage />);
    const trigger = screen.getByRole("button", { name: "계정·알림 설정" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "계정과 알림" })).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "계정과 알림" })).toBeInTheDocument();
  });

  it("forwards the route-owned load-more callback without replacing rendered records", async () => {
    const user = userEvent.setup();
    const onLoadMoreJourney = vi.fn().mockResolvedValue(undefined);
    renderMyPage({ onLoadMoreJourney });

    await user.click(screen.getByRole("button", { name: "기록 더 보기" }));
    expect(onLoadMoreJourney).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("article", { name: "9차 보이지 않는 도시들" })).toBeInTheDocument();
  });

  it("shows the membership-aware empty action instead of zero-value record rows", () => {
    renderMyPage({ journey: { ...journey, items: [], nextCursor: null } });

    expect(screen.getByText("아직 쌓인 개인 기록이 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "아카이브 보기" })).toHaveAttribute("href", "/app/archive");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "개인 요약" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "책별 기록" })).not.toBeInTheDocument();
    expect(screen.queryByText("완독 0/0")).not.toBeInTheDocument();
  });

  it("links active members with no records to their real current session", () => {
    renderMyPage({
      data: { ...profile, currentSessionId: "current-session" },
      journey: { ...journey, items: [], nextCursor: null },
    });

    expect(screen.getByRole("link", { name: "이번 세션 보기" })).toHaveAttribute(
      "href",
      "/app/session/current",
    );
  });

  it("keeps a viewer's empty shelf free of personal-summary metrics and record chrome", () => {
    renderMyPage({
      data: { ...profile, membershipStatus: "VIEWER", currentSessionId: "current-session" },
      journey: { ...journey, items: [], nextCursor: null, summary: { ...journey.summary, attendedSessionCount: 0, completedReadingCount: 0, questionCount: 0, reviewCount: 0 } },
    });

    expect(screen.getByRole("link", { name: "아카이브 둘러보기" })).toHaveAttribute("href", "/app/archive");
    expect(screen.queryByRole("region", { name: "개인 요약" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "책별 기록" })).not.toBeInTheDocument();
    expect(screen.queryByText("완독 0/0")).not.toBeInTheDocument();
  });

  it("uses active-member feedback copy when a suspended member sees a locked document", () => {
    renderMyPage({
      data: { ...profile, membershipStatus: "SUSPENDED" },
      journey: {
        ...journey,
        items: [{ ...journey.items[0], feedbackDocument: { available: true, readable: false, lockedReason: "ACTIVE_MEMBERSHIP_REQUIRED" } }],
      },
    });

    expect(screen.getByText("활성 멤버가 되면 피드백 문서를 읽을 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText("정식 멤버가 되면 피드백 문서를 읽을 수 있습니다.")).not.toBeInTheDocument();
  });
});

function renderProps(): Parameters<typeof MyPage>[0] {
  return {
    data: profile,
    journey,
    LogoutButtonComponent: ({ children }) => <button type="button">{children}</button>,
    onLeaveMembership: async () => undefined,
    notificationPreferences,
    onSaveNotificationPreferences: async (preferences) => preferences,
    onLoadMoreJourney: async () => undefined,
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function installRouterRequestShim() {
  const NativeRequest = globalThis.Request;

  vi.stubGlobal(
    "Request",
    class RouterTestRequest extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init === undefined ? init : { ...init, signal: undefined });
      }
    },
  );
}

function routeJourney(overrides: Partial<MyJourneyPage> = {}): MyJourneyPage {
  return {
    items: [
      {
        sessionId: "session-1",
        sessionNumber: 1,
        bookTitle: "첫 번째 책",
        bookAuthor: "첫 저자",
        bookImageUrl: null,
        date: "2026-07-22",
        readingProgress: 100,
        questionCount: 1,
        reviewCount: 0,
        feedbackDocument: { available: true, readable: true, lockedReason: null },
      },
    ],
    nextCursor: null,
    summary: journey.summary,
    ...overrides,
  };
}

const routeAuth = {
  authenticated: true,
  userId: "member-user",
  membershipId: "member-membership",
  clubId: "club-id",
  email: profile.email,
  displayName: profile.displayName,
  accountName: profile.accountName,
  role: profile.role,
  membershipStatus: profile.membershipStatus,
  approvalState: "ACTIVE",
};

function TestLogoutButton({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={async () => {
        const response = await fetch("/api/bff/api/auth/logout", { method: "POST" });
        if (response.ok) globalThis.location.href = "/login";
      }}
    >
      {children}
    </button>
  );
}

function renderMyPageRoute(
  fetchMock: ReturnType<typeof vi.fn>,
  canEditProfile = false,
  { path = "/app/me", initialEntry = path }: { path?: string; initialEntry?: string } = {},
) {
  installRouterRequestShim();
  vi.stubGlobal("fetch", fetchMock);
  const router = createMemoryRouter(
    [
      {
        path,
        element: <MyPageRoute LogoutButtonComponent={TestLogoutButton} canEditProfile={canEditProfile} onProfileUpdated={async () => undefined} />,
        loader: myPageLoader,
        hydrateFallbackElement: <div>내 공간을 불러오는 중</div>,
      },
    ],
    { initialEntries: [initialEntry] },
  );

  return render(<RouterProvider router={router} />);
}

function defaultRouteFetch({
  routeProfile = profile,
  routeJourneyPage = routeJourney(),
  notificationStatus = 200,
}: {
  routeProfile?: MyPageProfile;
  routeJourneyPage?: MyJourneyPage;
  notificationStatus?: number;
} = {}) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === "/api/bff/api/auth/me") return Promise.resolve(jsonResponse(routeAuth));
    if (url === "/api/bff/api/app/me") return Promise.resolve(jsonResponse(routeProfile));
    if (url === "/api/bff/api/archive/me/journey?limit=12") return Promise.resolve(jsonResponse(routeJourneyPage));
    if (url === "/api/bff/api/me/notifications/preferences") return Promise.resolve(jsonResponse(notificationPreferences, notificationStatus));
    return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
  });
}

describe("MyPage route regressions", () => {
  it("continues with the same cursor once while pending and drops duplicate session rows", async () => {
    const user = userEvent.setup();
    const nextPage = createDeferred<MyJourneyPage>();
    let continuationRequests = 0;
    const fetchMock = defaultRouteFetch({ routeJourneyPage: routeJourney({ nextCursor: "cursor-2" }) });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/bff/api/auth/me") return Promise.resolve(jsonResponse(routeAuth));
      if (url === "/api/bff/api/app/me") return Promise.resolve(jsonResponse(profile));
      if (url === "/api/bff/api/archive/me/journey?limit=12") return Promise.resolve(jsonResponse(routeJourney({ nextCursor: "cursor-2" })));
      if (url === "/api/bff/api/archive/me/journey?limit=12&cursor=cursor-2") {
        continuationRequests += 1;
        return nextPage.promise.then((page) => jsonResponse(page));
      }
      if (url === "/api/bff/api/me/notifications/preferences") return Promise.resolve(jsonResponse(notificationPreferences));
      return Promise.resolve(jsonResponse({}, 404));
    });
    renderMyPageRoute(fetchMock);

    await user.click(await screen.findByRole("button", { name: "기록 더 보기" }));
    expect(screen.getByRole("button", { name: "기록을 불러오는 중" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "기록을 불러오는 중" }));
    expect(continuationRequests).toBe(1);

    await act(async () => {
      nextPage.resolve(
        routeJourney({
          items: [
            routeJourney().items[0],
            { ...routeJourney().items[0], sessionId: "session-2", sessionNumber: 2, bookTitle: "두 번째 책" },
            { ...routeJourney().items[0], sessionId: "session-2", sessionNumber: 2, bookTitle: "중복된 책" },
          ],
        }),
      );
    });

    expect(await screen.findByRole("article", { name: "2차 두 번째 책" })).toBeInTheDocument();
    expect(screen.queryByText("중복된 책")).not.toBeInTheDocument();
  });

  it("keeps existing rows after continuation failure and retries its cursor", async () => {
    const user = userEvent.setup();
    let continuationRequests = 0;
    const fetchMock = defaultRouteFetch({ routeJourneyPage: routeJourney({ nextCursor: "cursor-2" }) });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/bff/api/auth/me") return Promise.resolve(jsonResponse(routeAuth));
      if (url === "/api/bff/api/app/me") return Promise.resolve(jsonResponse(profile));
      if (url === "/api/bff/api/archive/me/journey?limit=12") return Promise.resolve(jsonResponse(routeJourney({ nextCursor: "cursor-2" })));
      if (url === "/api/bff/api/archive/me/journey?limit=12&cursor=cursor-2") {
        continuationRequests += 1;
        return continuationRequests === 1
          ? Promise.reject(new Error("temporary failure"))
          : Promise.resolve(jsonResponse(routeJourney({ items: [{ ...routeJourney().items[0], sessionId: "session-2", sessionNumber: 2, bookTitle: "재시도 책" }] })));
      }
      if (url === "/api/bff/api/me/notifications/preferences") return Promise.resolve(jsonResponse(notificationPreferences));
      return Promise.resolve(jsonResponse({}, 404));
    });
    renderMyPageRoute(fetchMock);

    await user.click(await screen.findByRole("button", { name: "기록 더 보기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("기록을 더 불러오지 못했습니다.");
    expect(screen.getByRole("article", { name: "1차 첫 번째 책" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("article", { name: "2차 재시도 책" })).toBeInTheDocument();
    expect(continuationRequests).toBe(2);
  });

  it("keeps the settings disclosure open after profile revalidation", async () => {
    const user = userEvent.setup();
    let myPageRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/bff/api/auth/me") return Promise.resolve(jsonResponse(routeAuth));
      if (url === "/api/bff/api/app/me") {
        myPageRequests += 1;
        return Promise.resolve(jsonResponse(myPageRequests === 1 ? profile : { ...profile, displayName: "새이름" }));
      }
      if (url === "/api/bff/api/archive/me/journey?limit=12") return Promise.resolve(jsonResponse(routeJourney()));
      if (url === "/api/bff/api/me/notifications/preferences") return Promise.resolve(jsonResponse(notificationPreferences));
      if (url === "/api/bff/api/me/profile") {
        const response: MemberProfileResponse = { membershipId: "member-membership", displayName: "새이름", accountName: profile.accountName, profileImageUrl: null };
        return Promise.resolve(jsonResponse(response));
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
    renderMyPageRoute(fetchMock, true);

    const settings = await screen.findByRole("button", { name: "계정·알림 설정" });
    await user.click(settings);
    await user.click(screen.getByRole("button", { name: "이름 변경" }));
    await user.clear(screen.getByLabelText("이름"));
    await user.type(screen.getByLabelText("이름"), "새이름");
    await user.click(screen.getByRole("button", { name: "이름 저장" }));

    await waitFor(() => expect(myPageRequests).toBe(2));
    expect(await screen.findByText("새이름")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "계정·알림 설정" })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows optional notification failure and successfully retries the loader", async () => {
    const user = userEvent.setup();
    let notificationRequests = 0;
    const fetchMock = defaultRouteFetch();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/bff/api/auth/me") return Promise.resolve(jsonResponse(routeAuth));
      if (url === "/api/bff/api/app/me") return Promise.resolve(jsonResponse(profile));
      if (url === "/api/bff/api/archive/me/journey?limit=12") return Promise.resolve(jsonResponse(routeJourney()));
      if (url === "/api/bff/api/me/notifications/preferences") {
        notificationRequests += 1;
        return Promise.resolve(jsonResponse(notificationPreferences, notificationRequests === 1 ? 500 : 200));
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
    renderMyPageRoute(fetchMock);

    await user.click(await screen.findByRole("button", { name: "계정·알림 설정" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("알림 설정을 불러오지 못했습니다.");
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(notificationRequests).toBe(2));
    expect(await screen.findByRole("switch", { name: "이메일 알림" })).toBeInTheDocument();
  });

  it("leaves through the route API with the default policy and redirects to the scoped club public page", async () => {
    const user = userEvent.setup();
    const location = { href: "", pathname: "/clubs/reading-sai/app/me" };
    vi.stubGlobal("location", location);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") return Promise.resolve(jsonResponse(routeAuth));
      if (url === "/api/bff/api/app/me?clubSlug=reading-sai") return Promise.resolve(jsonResponse(profile));
      if (url === "/api/bff/api/archive/me/journey?limit=12&clubSlug=reading-sai") return Promise.resolve(jsonResponse(routeJourney()));
      if (url === "/api/bff/api/me/notifications/preferences?clubSlug=reading-sai") return Promise.resolve(jsonResponse(notificationPreferences));
      if (url === "/api/bff/api/me/membership/leave?clubSlug=reading-sai") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(jsonResponse({}, 404));
    });
    renderMyPageRoute(fetchMock, false, {
      path: "/clubs/:clubSlug/app/me",
      initialEntry: "/clubs/reading-sai/app/me",
    });

    await user.click(await screen.findByRole("button", { name: "계정·알림 설정" }));
    await user.click(screen.getByRole("button", { name: "탈퇴" }));
    await user.click(screen.getByRole("button", { name: "탈퇴 확인" }));

    const leaveRequest = fetchMock.mock.calls.find(([input]) => input.toString().includes("/membership/leave"));
    expect(leaveRequest).toBeDefined();
    expect(leaveRequest?.[0]).toBe("/api/bff/api/me/membership/leave?clubSlug=reading-sai");
    expect(leaveRequest?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ currentSessionPolicy: "APPLY_NOW" }),
    });
    expect(location.href).toBe("/clubs/reading-sai/about");
  });
});

describe("MyPage account controls", () => {
  it("logs out through the BFF from the disclosed settings", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    renderMyPage({ LogoutButtonComponent: TestLogoutButton, settingsOpen: true });

    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/logout", { method: "POST" }));
    expect(location.href).toBe("/login");
  });

});
