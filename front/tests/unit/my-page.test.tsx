import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type CSSProperties, type ReactNode } from "react";
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FeedbackDocumentListItem,
  MemberProfileResponse,
  MyPageResponse,
  NotificationPreferencesResponse,
} from "@/features/archive/api/archive-contracts";
import { myPageLoader } from "@/features/archive/route/my-page-data";
import MyPage from "@/features/archive/ui/my-page";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { AuthActionsContext, AuthContext } from "@/src/app/auth-state";
import MyRoutePage from "@/src/pages/my-page";
import type { PagedResponse } from "@/shared/model/paging";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type MyPageProps = Parameters<typeof MyPage>[0];

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type EditableMyPageProps = MyPageProps & {
  canEditProfile: boolean;
  onUpdateProfile: (displayName: string) => Promise<MemberProfileResponse>;
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

function pageOf<T>(items: T[], nextCursor: string | null = null): PagedResponse<T> {
  return { items, nextCursor };
}

function TestLogoutButton({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={async () => {
        const response = await fetch("/api/bff/api/auth/logout", { method: "POST" });

        if (response.ok) {
          globalThis.location.href = "/login";
        }
      }}
    >
      {children}
    </button>
  );
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

async function testLeaveMembership() {
  const response = await fetch("/api/bff/api/me/membership/leave", {
    method: "POST",
    body: JSON.stringify({ currentSessionPolicy: "APPLY_NOW" }),
  });

  if (!response.ok) {
    throw new Error("Leave membership failed");
  }
}

const data: MyPageResponse = {
  displayName: "우",
  accountName: "김호스트",
  email: "host@example.com",
  role: "HOST",
  membershipStatus: "ACTIVE",
  clubName: "읽는사이",
  joinedAt: "2025-11",
  sessionCount: 6,
  totalSessionCount: 13,
  recentAttendances: [
    { sessionNumber: 8, attended: true },
    { sessionNumber: 9, attended: true },
    { sessionNumber: 10, attended: false },
    { sessionNumber: 11, attended: true },
    { sessionNumber: 12, attended: true },
    { sessionNumber: 13, attended: true },
  ],
};

const activeAuth: AuthMeResponse = {
  authenticated: true,
  userId: "member-user",
  membershipId: "member-membership",
  clubId: "club-id",
  email: data.email,
  displayName: data.displayName,
  accountName: data.accountName,
  role: data.role,
  membershipStatus: data.membershipStatus,
  approvalState: "ACTIVE",
};

const regularMemberData: MyPageResponse = {
  ...data,
  displayName: "멤버5",
  accountName: "김멤버",
  email: "member@example.com",
  role: "MEMBER",
};

const regularMemberAuth: AuthMeResponse = {
  ...activeAuth,
  email: regularMemberData.email,
  displayName: regularMemberData.displayName,
  accountName: regularMemberData.accountName,
  role: "MEMBER",
};

const viewerAuth: AuthMeResponse = {
  ...activeAuth,
  email: "viewer@example.com",
  displayName: "Viewer",
  accountName: "Viewer Member",
  role: "MEMBER",
  membershipStatus: "VIEWER",
  approvalState: "VIEWER",
};

const notificationPreferences: NotificationPreferencesResponse = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: false,
  },
};

function memberProfileResponse(displayName: string): MemberProfileResponse {
  return {
    membershipId: "member-membership",
    displayName,
    accountName: data.accountName,
    profileImageUrl: null,
  };
}

const reports: FeedbackDocumentListItem[] = [
  {
    sessionId: "session-1",
    sessionNumber: 1,
    title: "독서모임 1차 피드백",
    bookTitle: "팩트풀니스",
    date: "2025-11-26",
    fileName: "251126 1차.md",
    uploadedAt: "2026-04-20T09:00:00Z",
  },
];
const reportPage = pageOf(reports);
const reportReadLabel = "No.01 팩트풀니스 피드백 문서 읽기";

function renderMyPage(overrides: Partial<MyPageProps> = {}) {
  const props: MyPageProps = {
    data,
    reports: reportPage,
    reviewCount: 3,
    questionCount: 7,
    LogoutButtonComponent: TestLogoutButton,
    onLeaveMembership: testLeaveMembership,
    notificationPreferences,
    onSaveNotificationPreferences: async (preferences) => preferences,
    ...overrides,
  };

  return render(<MyPage {...props} />);
}

function renderEditableMyPage(overrides: Partial<EditableMyPageProps> = {}) {
  const props: EditableMyPageProps = {
    data,
    reports: reportPage,
    reviewCount: 3,
    questionCount: 7,
    LogoutButtonComponent: TestLogoutButton,
    onLeaveMembership: testLeaveMembership,
    canEditProfile: true,
    onUpdateProfile: async (displayName: string) => memberProfileResponse(displayName),
    notificationPreferences,
    onSaveNotificationPreferences: async (preferences) => preferences,
    ...overrides,
  };

  return render(<MyPage {...props} />);
}

function renderMyRouteWithProfileFetch({
  auth = activeAuth,
  initialMyPageData = data,
  profileStatus = 200,
  profileBody = memberProfileResponse("새이름"),
  nextMyPageData = { ...data, displayName: "새이름" },
}: {
  auth?: AuthMeResponse;
  initialMyPageData?: MyPageResponse;
  profileStatus?: number;
  profileBody?: unknown;
  nextMyPageData?: MyPageResponse;
} = {}) {
  installRouterRequestShim();
  const refreshAuth = vi.fn().mockResolvedValue(undefined);
  let myPageRequestCount = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();

    if (url === "/api/bff/api/auth/me") {
      return Promise.resolve(jsonResponse(auth));
    }

    if (url === "/api/bff/api/app/me") {
      myPageRequestCount += 1;
      return Promise.resolve(jsonResponse(myPageRequestCount > 1 ? nextMyPageData : initialMyPageData));
    }

    if (url === "/api/bff/api/feedback-documents/me?limit=30") {
      return Promise.resolve(jsonResponse(reportPage));
    }

    if (url === "/api/bff/api/archive/me/questions?limit=30") {
      return Promise.resolve(jsonResponse(pageOf(new Array(7).fill(null))));
    }

    if (url === "/api/bff/api/archive/me/reviews?limit=30") {
      return Promise.resolve(jsonResponse(pageOf(new Array(3).fill(null))));
    }

    if (url === "/api/bff/api/me/notifications/preferences") {
      return Promise.resolve(jsonResponse(notificationPreferences));
    }

    if (url === "/api/bff/api/me/profile") {
      return Promise.resolve(jsonResponse(profileBody, profileStatus));
    }

    return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
  });
  vi.stubGlobal("fetch", fetchMock);

  const router = createMemoryRouter(
    [
      {
        path: "/app/me",
        element: <MyRoutePage />,
        loader: myPageLoader,
        hydrateFallbackElement: <div>내 공간을 불러오는 중</div>,
      },
    ],
    { initialEntries: ["/app/me"] },
  );

  const view = render(
    <AuthActionsContext.Provider value={{ markLoggedOut: vi.fn(), refreshAuth }}>
      <AuthContext.Provider value={{ status: "ready", auth }}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </AuthActionsContext.Provider>,
  );

  return {
    ...view,
    fetchMock,
    refreshAuth,
    getMyPageRequestCount: () => myPageRequestCount,
  };
}

async function startDesktopProfileEdit(container: HTMLElement) {
  const user = userEvent.setup();
  expect(await screen.findByRole("heading", { level: 1, name: "계정과 기록" })).toBeInTheDocument();
  const scoped = desktopScope(container);
  await user.click(scoped.getByRole("button", { name: "이름 변경" }));
  return { user, scoped };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function desktopScope(container: HTMLElement) {
  const desktop = container.querySelector(".desktop-only");
  return desktop ? within(desktop as HTMLElement) : screen;
}

function LocationStateEcho() {
  const location = useLocation();
  const state = location.state as { readmatesReturnTo?: string; readmatesReturnLabel?: string } | null;

  return (
    <main>
      <div data-testid="return-to">{state?.readmatesReturnTo ?? ""}</div>
      <div data-testid="return-label">{state?.readmatesReturnLabel ?? ""}</div>
    </main>
  );
}

describe("MyPage", () => {
  it("shows editable profile identity details on desktop", () => {
    const { container } = renderEditableMyPage();
    const scoped = desktopScope(container);

    expect(scoped.getAllByText("우").length).toBeGreaterThan(0);
    expect(scoped.getByText("host@example.com")).toBeInTheDocument();
    expect(scoped.queryByText("김호스트")).not.toBeInTheDocument();
    expect(scoped.queryByText("@우")).not.toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "이름 변경" })).toBeInTheDocument();
  });

  it("exposes the same profile edit capability on mobile", () => {
    const { container } = renderEditableMyPage();
    const mobile = within(container.querySelector(".rm-my-mobile") as HTMLElement);

    expect(mobile.getAllByText("우").length).toBeGreaterThan(0);
    expect(mobile.getByText("host@example.com")).toBeInTheDocument();
    expect(mobile.queryByText("김호스트")).not.toBeInTheDocument();
    expect(mobile.queryByText("@우")).not.toBeInTheDocument();
    expect(mobile.getByRole("button", { name: "이름 변경" })).toBeInTheDocument();
  });

  it("does not expose own profile editing for hosts on desktop or mobile routes", async () => {
    const { container } = renderMyRouteWithProfileFetch();

    expect(await screen.findByRole("heading", { level: 1, name: "계정과 기록" })).toBeInTheDocument();

    const desktop = desktopScope(container);
    const mobile = within(container.querySelector(".rm-my-mobile") as HTMLElement);

    expect(desktop.getByText("프로필 수정 준비 중")).toBeInTheDocument();
    expect(desktop.queryByRole("button", { name: "이름 변경" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("button", { name: "이름 변경" })).not.toBeInTheDocument();
    expect(mobile.queryByText("이름")).not.toBeInTheDocument();
  });

  it("does not expose own profile editing for regular members on desktop or mobile routes", async () => {
    const { container } = renderMyRouteWithProfileFetch({
      auth: regularMemberAuth,
      initialMyPageData: regularMemberData,
      nextMyPageData: regularMemberData,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "계정과 기록" })).toBeInTheDocument();

    const desktop = desktopScope(container);
    const mobile = within(container.querySelector(".rm-my-mobile") as HTMLElement);

    expect(desktop.getByText("프로필 수정 준비 중")).toBeInTheDocument();
    expect(desktop.queryByRole("button", { name: "이름 변경" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("button", { name: "이름 변경" })).not.toBeInTheDocument();
    expect(mobile.queryByText("이름")).not.toBeInTheDocument();
  });

  it("loads viewer my page without requesting notification preferences", async () => {
    installRouterRequestShim();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(viewerAuth));
      }

      if (url === "/api/bff/api/app/me") {
        return Promise.resolve(
          jsonResponse({
            ...regularMemberData,
            email: viewerAuth.email,
            displayName: viewerAuth.displayName,
            accountName: viewerAuth.accountName,
            membershipStatus: "VIEWER",
            sessionCount: 0,
            recentAttendances: [],
          }),
        );
      }

      if (url === "/api/bff/api/feedback-documents/me?limit=30") {
        return Promise.resolve(jsonResponse({ message: "forbidden" }, 403));
      }

      if (url === "/api/bff/api/archive/me/questions?limit=30" || url === "/api/bff/api/archive/me/reviews?limit=30") {
        return Promise.resolve(jsonResponse(pageOf([])));
      }

      if (url === "/api/bff/api/me/notifications/preferences") {
        return Promise.resolve(jsonResponse({ message: "forbidden" }, 403));
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    const router = createMemoryRouter(
      [
        {
          path: "/app/me",
          element: <MyRoutePage />,
          loader: myPageLoader,
          hydrateFallbackElement: <div>내 공간을 불러오는 중</div>,
        },
      ],
      { initialEntries: ["/app/me"] },
    );

    render(
      <AuthActionsContext.Provider value={{ markLoggedOut: vi.fn(), refreshAuth: vi.fn().mockResolvedValue(undefined) }}>
        <AuthContext.Provider value={{ status: "ready", auth: viewerAuth }}>
          <RouterProvider router={router} />
        </AuthContext.Provider>
      </AuthActionsContext.Provider>,
    );

    expect(await screen.findByRole("heading", { level: 1, name: "계정과 기록" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "페이지를 불러오지 못했습니다." })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => input.toString() === "/api/bff/api/me/notifications/preferences")).toBe(false);
    expect(screen.queryAllByRole("button", { name: "알림 설정 저장" })).toHaveLength(0);
  });

  it("saves a trimmed display name through the profile editor", async () => {
    const onUpdateProfile = vi.fn(async (displayName: string) => memberProfileResponse(displayName));
    const { container } = renderEditableMyPage({ onUpdateProfile });
    const { user, scoped } = await startDesktopProfileEdit(container);

    const input = scoped.getByLabelText("이름");
    await user.clear(input);
    await user.type(input, "  새이름  ");
    await user.click(scoped.getByRole("button", { name: "이름 저장" }));

    expect(onUpdateProfile).toHaveBeenCalledWith("새이름");
    expect((await scoped.findAllByText("새이름")).length).toBeGreaterThan(0);
    expect(scoped.getByText("host@example.com")).toBeInTheDocument();
  });

  it("blocks duplicate profile submits and marks the field pending while saving", async () => {
    const deferred = createDeferred<MemberProfileResponse>();
    const onUpdateProfile = vi.fn(() => deferred.promise);
    const user = userEvent.setup();
    const { container } = renderEditableMyPage({ onUpdateProfile });
    const scoped = desktopScope(container);

    await user.click(scoped.getByRole("button", { name: "이름 변경" }));
    const input = scoped.getByLabelText("이름");
    await user.clear(input);
    await user.type(input, "새이름");
    const saveButton = scoped.getByRole("button", { name: "이름 저장" });
    await user.dblClick(saveButton);

    expect(onUpdateProfile).toHaveBeenCalledTimes(1);
    expect(onUpdateProfile).toHaveBeenCalledWith("새이름");
    expect(input).toBeDisabled();
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveTextContent("저장 중");

    await act(async () => {
      deferred.resolve(memberProfileResponse("새이름"));
      await deferred.promise;
    });
  });

  it.each([
    ["DISPLAY_NAME_DUPLICATE", "같은 클럽에서 이미 쓰고 있는 이름입니다."],
    ["DISPLAY_NAME_REQUIRED", "이름을 입력해 주세요."],
    ["DISPLAY_NAME_TOO_LONG", "이름은 20자 이하로 입력해 주세요."],
    ["DISPLAY_NAME_INVALID", "이름으로 쓸 수 없는 형식입니다."],
    ["DISPLAY_NAME_RESERVED", "시스템에서 쓰는 이름은 사용할 수 없습니다."],
    ["MEMBERSHIP_NOT_ALLOWED", "현재 상태에서는 프로필을 수정할 수 없습니다."],
  ])("shows the %s profile error near the field", async (code, message) => {
    void code;
    const { container } = renderEditableMyPage({
      onUpdateProfile: async () => {
        throw new Error(message);
      },
    });
    const { user, scoped } = await startDesktopProfileEdit(container);

    const input = scoped.getByLabelText("이름");
    await user.clear(input);
    await user.type(input, "새이름");
    await user.click(scoped.getByRole("button", { name: "이름 저장" }));

    expect(await scoped.findByText(message)).toBeInTheDocument();
  });

  it("shows a local generic alert for unknown profile save failures", async () => {
    const { container } = renderEditableMyPage({
      onUpdateProfile: async () => {
        throw new Error("SQL constraint failed: members.display_name_unique");
      },
    });
    const { user, scoped } = await startDesktopProfileEdit(container);

    const input = scoped.getByLabelText("이름");
    await user.clear(input);
    await user.type(input, "새이름");
    await user.click(scoped.getByRole("button", { name: "이름 저장" }));

    expect(await scoped.findByRole("alert")).toHaveTextContent(
      "이름 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    );
    expect(scoped.queryByText(/SQL constraint failed/)).not.toBeInTheDocument();
  });

  it("does not expose profile editing or send profile requests when profile editing is not allowed", () => {
    const onUpdateProfile = vi.fn();
    const { container } = renderEditableMyPage({ canEditProfile: false, onUpdateProfile });
    const scoped = desktopScope(container);

    expect(scoped.queryByRole("button", { name: "이름 변경" })).not.toBeInTheDocument();
    expect(onUpdateProfile).not.toHaveBeenCalled();
  });

  it("shows account, rhythm, and feedback document sections", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    expect(scoped.getByRole("heading", { level: 1, name: "계정과 기록" })).toBeInTheDocument();
    expect(scoped.queryByText("My")).not.toBeInTheDocument();
    expect(scoped.queryByText("내 서가 · 계정")).not.toBeInTheDocument();
    expect(scoped.getByText("계정")).toBeInTheDocument();
    expect(scoped.getAllByText("우").length).toBeGreaterThan(0);
    expect(scoped.queryByText("김호스트")).not.toBeInTheDocument();
    expect(scoped.getByText("host@example.com")).toBeInTheDocument();
    expect(scoped.getByText("호스트")).toBeInTheDocument();
    expect(scoped.getByText("읽는사이")).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(scoped.getByText("나의 리듬")).toBeInTheDocument();
    expect(scoped.getByText("피드백 문서")).toBeInTheDocument();
    expect(scoped.getByText("· 전체 1개")).toBeInTheDocument();
    expect(scoped.getByText("내가 남긴 문장")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: /모임 전에 꺼낸 질문과 초안/ })).toHaveAttribute("href", "/app/archive?view=questions");
    expect(scoped.getByRole("link", { name: /회차별로 남긴 장문 서평/ })).toHaveAttribute("href", "/app/archive?view=reviews");
    expect(scoped.getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/app/archive?view=report");
    expect(scoped.getByRole("link", { name: "전체 보기" })).toHaveClass("btn", "btn-quiet", "btn-sm");
    expect(scoped.getByText("팩트풀니스")).toBeInTheDocument();
    expect(scoped.getByText("2025.11")).toBeInTheDocument();
    expect(scoped.getByText("2025.11.26 · 피드백 문서")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: reportReadLabel })).toHaveAttribute("href", "/app/feedback/session-1");
    expect(scoped.queryByRole("link", { name: /PDF로 저장/ })).not.toBeInTheDocument();
    expect(scoped.queryByText("읽기")).not.toBeInTheDocument();
    expect(scoped.queryByText("PDF로 저장")).not.toBeInTheDocument();
    expect(scoped.queryByText("물고기는 존재하지 않는다")).not.toBeInTheDocument();
    expect(scoped.queryByText("feedback-13.html")).not.toBeInTheDocument();
  });

  it("appends feedback documents on my page when 더 보기 is clicked", async () => {
    const user = userEvent.setup();
    const nextReport: FeedbackDocumentListItem = {
      sessionId: "session-2",
      sessionNumber: 2,
      title: "독서모임 2차 피드백",
      bookTitle: "냉정한 이타주의자",
      date: "2025-12-17",
      fileName: "251217 2차.md",
      uploadedAt: "2026-04-21T09:00:00Z",
    };

    function MyPageLoadMoreHarness() {
      const [reportsPage, setReportsPage] = useState<PagedResponse<FeedbackDocumentListItem>>(
        pageOf(reports, "cursor-next"),
      );

      return (
        <MyPage
          data={data}
          reports={reportsPage}
          reviewCount={3}
          questionCount={7}
          LogoutButtonComponent={TestLogoutButton}
          onLeaveMembership={testLeaveMembership}
          notificationPreferences={notificationPreferences}
          onSaveNotificationPreferences={async (preferences) => preferences}
          onLoadMoreReports={async () => {
            setReportsPage((current) => ({
              items: [...current.items, nextReport],
              nextCursor: null,
            }));
          }}
        />
      );
    }

    const { container } = render(<MyPageLoadMoreHarness />);
    const scoped = desktopScope(container);

    expect(scoped.getByText("팩트풀니스")).toBeInTheDocument();
    expect(scoped.queryByText("냉정한 이타주의자")).not.toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "더 보기" }));

    expect(scoped.getByText("팩트풀니스")).toBeInTheDocument();
    expect(scoped.getByText("냉정한 이타주의자")).toBeInTheDocument();
    expect(scoped.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
  });

  it("encodes feedback document links from my page reports", () => {
    const { container } = renderMyPage({
      reports: pageOf([
        {
          ...reports[0],
          sessionId: "session 1/slash",
        },
      ]),
    });
    const scoped = desktopScope(container);

    expect(scoped.getByRole("link", { name: reportReadLabel })).toHaveAttribute(
      "href",
      "/app/feedback/session%201%2Fslash",
    );
    expect(scoped.queryByRole("link", { name: /PDF로 저장/ })).not.toBeInTheDocument();
  });

  it("renders the standalone-aligned mobile my page shell", () => {
    const { container } = renderMyPage();

    const mobile = container.querySelector(".rm-my-mobile");
    expect(mobile).not.toBeNull();
    const scoped = within(mobile as HTMLElement);

    expect(scoped.queryByText("내 서가 · 계정")).not.toBeInTheDocument();
    expect(scoped.getAllByText("우").length).toBeGreaterThan(0);
    expect(scoped.queryByText("김호스트")).not.toBeInTheDocument();
    expect(scoped.getByText("host@example.com")).toBeInTheDocument();
    expect(scoped.getByText("6")).toBeInTheDocument();
    expect(scoped.getByText("참석")).toBeInTheDocument();
    expect(scoped.getByText("3")).toBeInTheDocument();
    expect(scoped.getByText("서평")).toBeInTheDocument();
    expect(scoped.getByText("7")).toBeInTheDocument();
    expect(scoped.getByText("질문")).toBeInTheDocument();
    expect(scoped.getByText("멤버 상태")).toBeInTheDocument();
    expect(scoped.getByText("정식 멤버")).toBeInTheDocument();
    expect(scoped.getByText("클럽")).toBeInTheDocument();
    expect(scoped.getByText("읽는사이")).toBeInTheDocument();
    expect(scoped.getByText("합류")).toBeInTheDocument();
    expect(scoped.getByText("2025.11")).toBeInTheDocument();
    expect(scoped.queryByText("호스트 · 2025.11 합류")).not.toBeInTheDocument();
    expect(scoped.queryByText("내 글")).not.toBeInTheDocument();
    expect(scoped.getByRole("link", { name: "질문 7" })).toHaveAttribute("href", "/app/archive?view=questions");
    expect(scoped.getByRole("link", { name: "서평 3" })).toHaveAttribute("href", "/app/archive?view=reviews");
    expect(scoped.queryByText("읽기 전용 설정")).not.toBeInTheDocument();
    expect(scoped.getByText("알림")).toBeInTheDocument();
    expect(scoped.getByRole("switch", { name: "이메일 알림" })).toBeInTheDocument();
    expect(scoped.queryByText("캘린더 연동")).not.toBeInTheDocument();
    expect(scoped.queryByText("테마 · 표시")).not.toBeInTheDocument();
    expect(scoped.queryByText("연결 안 됨")).not.toBeInTheDocument();
    expect(scoped.queryByText("라이트")).not.toBeInTheDocument();
    expect(scoped.getByText("· 전체 1개")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/app/archive?view=report");
    expect(scoped.getByText("팩트풀니스")).toBeInTheDocument();
    expect(scoped.getByText("No.01 · 2025.11.26")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: reportReadLabel })).toHaveAttribute("href", "/app/feedback/session-1");
    expect(scoped.queryByRole("link", { name: /PDF로 저장/ })).not.toBeInTheDocument();
    expect(scoped.queryByText("준비 중")).not.toBeInTheDocument();
    expect(scoped.getByText("클럽 탈퇴 · 내 기록은 유지, 내 이름은 비공개 처리됩니다.")).toBeInTheDocument();
    const leaveButton = scoped.getByRole("button", { name: "탈퇴" });
    expect(leaveButton).toBeInTheDocument();
    expect(leaveButton).toHaveStyle({ whiteSpace: "nowrap", flexShrink: "0" });
    expect(scoped.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(mobile?.querySelector(".m-card")).not.toBeNull();
    expect(mobile?.querySelectorAll(".m-list")).toHaveLength(1);
  });

  it("shows feedback documents from the current page on my page summaries", () => {
    const manyReports: FeedbackDocumentListItem[] = [
      { ...reports[0], sessionId: "session-4", sessionNumber: 4, bookTitle: "모순", date: "2026-02-26" },
      { ...reports[0], sessionId: "session-3", sessionNumber: 3, bookTitle: "작별하지 않는다", date: "2026-01-26" },
      { ...reports[0], sessionId: "session-2", sessionNumber: 2, bookTitle: "냉정한 이타주의자", date: "2025-12-26" },
      reports[0],
    ];
    const { container } = renderMyPage({ reports: pageOf(manyReports) });
    const desktop = desktopScope(container);
    const mobile = within(container.querySelector(".rm-my-mobile") as HTMLElement);

    for (const title of ["모순", "작별하지 않는다", "냉정한 이타주의자", "팩트풀니스"]) {
      expect(desktop.getByText(title)).toBeInTheDocument();
    }
    expect(desktop.getByText("· 전체 4개")).toBeInTheDocument();

    expect(mobile.getByText("· 전체 4개")).toBeInTheDocument();
    expect(mobile.getByText("모순")).toBeInTheDocument();
    expect(mobile.getByText("작별하지 않는다")).toBeInTheDocument();
    expect(mobile.getByText("냉정한 이타주의자")).toBeInTheDocument();
    expect(mobile.getByText("팩트풀니스")).toBeInTheDocument();
    expect(mobile.getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/app/archive?view=report");
    expect(mobile.getByRole("link", { name: "전체 보기" })).toHaveClass("btn", "btn-quiet", "btn-sm");
    expect(mobile.getByRole("link", { name: "전체 보기" })).not.toHaveClass("m-chip");
  });

  it("opens a mobile feedback document from the list row and preserves my page return state", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={["/app/me"]}>
        <Routes>
          <Route
            path="/app/me"
            element={
              <MyPage
                data={data}
                reports={reportPage}
                reviewCount={3}
                questionCount={7}
                LogoutButtonComponent={TestLogoutButton}
                onLeaveMembership={testLeaveMembership}
                notificationPreferences={notificationPreferences}
                onSaveNotificationPreferences={async (preferences) => preferences}
              />
            }
          />
          <Route path="/app/feedback/:sessionId" element={<LocationStateEcho />} />
        </Routes>
      </MemoryRouter>,
    );
    const mobile = within(container.querySelector(".rm-my-mobile") as HTMLElement);

    const feedbackRow = mobile.getByText("팩트풀니스").closest(".m-list-row");
    expect(feedbackRow).not.toBeNull();
    expect(feedbackRow).toHaveAttribute("href", "/app/feedback/session-1");

    await user.click(feedbackRow as HTMLElement);

    expect(screen.getByTestId("return-to")).toHaveTextContent("/app/me");
    expect(screen.getByTestId("return-label")).toHaveTextContent("내 공간으로 돌아가기");
  });

  it("logs out from the mobile my page through the BFF", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();
    const { container } = renderMyPage();

    const mobile = container.querySelector(".rm-my-mobile");
    expect(mobile).not.toBeNull();

    await user.click(within(mobile as HTMLElement).getByRole("button", { name: "로그아웃" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/logout", { method: "POST" }),
    );
    expect(location.href).toBe("/login");
  });

  it("logs out from the desktop my page through the BFF", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    await user.click(scoped.getByRole("button", { name: "로그아웃" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/logout", { method: "POST" }),
    );
    expect(location.href).toBe("/login");
  });

  it("shows key notification and preference settings", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    expect(scoped.getByText("알림")).toBeInTheDocument();
    expect(scoped.getByText("다음 책 공개")).toBeInTheDocument();
    expect(scoped.getByText("예정 세션이 멤버에게 열릴 때")).toBeInTheDocument();
    expect(scoped.getByText("모임 전날 리마인더")).toBeInTheDocument();
    expect(scoped.getByText("개인 설정")).toBeInTheDocument();
    expect(scoped.getByText("이름")).toBeInTheDocument();
    expect(scoped.getByText("기록 공개 범위")).toBeInTheDocument();
    expect(scoped.getByText("클럽 탈퇴 · 내 기록은 유지, 내 이름은 비공개 처리됩니다.")).toBeInTheDocument();
  });

  it("renders editable notification preferences and saves changes", async () => {
    const user = userEvent.setup();
    const onSaveNotificationPreferences = vi.fn().mockResolvedValue({
      ...notificationPreferences,
      emailEnabled: false,
    });
    const { container } = renderMyPage({ onSaveNotificationPreferences });
    const scoped = desktopScope(container);

    await user.click(scoped.getByRole("switch", { name: "이메일 알림" }));
    await user.click(scoped.getByRole("button", { name: "알림 설정 저장" }));

    expect(onSaveNotificationPreferences).toHaveBeenCalledWith({
      emailEnabled: false,
      events: notificationPreferences.events,
    });
  });

  it("renders mobile notification preferences and saves changes", async () => {
    const user = userEvent.setup();
    const onSaveNotificationPreferences = vi.fn().mockResolvedValue({
      ...notificationPreferences,
      emailEnabled: false,
    });
    const { container } = renderMyPage({ onSaveNotificationPreferences });
    const mobile = within(container.querySelector(".rm-my-mobile") as HTMLElement);

    await user.click(mobile.getByRole("switch", { name: "이메일 알림" }));
    await user.click(mobile.getByRole("button", { name: "알림 설정 저장" }));

    expect(onSaveNotificationPreferences).toHaveBeenCalledWith({
      emailEnabled: false,
      events: notificationPreferences.events,
    });
  });

  it("keeps edited notification preferences visible after a save failure", async () => {
    const user = userEvent.setup();
    const onSaveNotificationPreferences = vi.fn().mockRejectedValue(new Error("temporary failure"));
    const { container } = renderMyPage({ onSaveNotificationPreferences });
    const scoped = desktopScope(container);

    await user.click(scoped.getByRole("switch", { name: "모임 전날 리마인더" }));
    await user.click(scoped.getByRole("button", { name: "알림 설정 저장" }));

    expect(await scoped.findByRole("alert")).toHaveTextContent(
      "알림 설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    );
    expect(scoped.getByRole("switch", { name: "모임 전날 리마인더" })).not.toBeChecked();
  });

  it("disables event notification controls while preserving their choices when email is off", async () => {
    const user = userEvent.setup();
    const { container } = renderMyPage();
    const scoped = desktopScope(container);
    const reminderSwitch = scoped.getByRole("switch", { name: "모임 전날 리마인더" });

    expect(reminderSwitch).toBeChecked();

    await user.click(scoped.getByRole("switch", { name: "이메일 알림" }));

    expect(reminderSwitch).toBeChecked();
    expect(reminderSwitch).toBeDisabled();
    expect(scoped.getAllByText("전체 알림 꺼짐")).toHaveLength(4);
  });

  it("uses contextual names for read-only account preference states", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    expect(scoped.getAllByText("우").length).toBeGreaterThan(0);
    expect(scoped.queryByText("김호스트 · host@example.com · @우")).not.toBeInTheDocument();
    expect(scoped.queryByText("@우")).not.toBeInTheDocument();
    expect(scoped.getByText("프로필 수정 준비 중")).toBeInTheDocument();
    expect(scoped.getAllByText("변경 준비 중")).toHaveLength(3);
    expect(scoped.getByLabelText("이름 변경 준비 중")).toBeInTheDocument();
    expect(scoped.getByLabelText("기록 공개 범위 변경 준비 중")).toBeInTheDocument();
    expect(scoped.getByLabelText("언어 변경 준비 중")).toBeInTheDocument();
    expect(scoped.queryByRole("button", { name: "이름 변경" })).not.toBeInTheDocument();
    expect(scoped.queryByRole("button", { name: "기록 공개 범위 변경" })).not.toBeInTheDocument();
    expect(scoped.queryByRole("button", { name: "언어 변경" })).not.toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "탈퇴" })).toBeInTheDocument();
  });

  it("derives viewer identity without a hard-coded club name", () => {
    const viewerData: MyPageResponse = {
      ...data,
      displayName: "Viewer",
      accountName: "Viewer Member",
      email: "viewer@example.com",
      role: "MEMBER",
      membershipStatus: "VIEWER",
      clubName: null,
      joinedAt: "",
      sessionCount: 0,
      totalSessionCount: 6,
      recentAttendances: [],
    };
    const { container } = renderMyPage({ data: viewerData, reports: pageOf([]), reviewCount: 0, questionCount: 0 });
    const desktop = desktopScope(container);
    const mobile = within(container.querySelector(".rm-my-mobile") as HTMLElement);

    expect(desktop.getByText("둘러보기 멤버")).toBeInTheDocument();
    expect(desktop.getByText("클럽 정보 없음")).toBeInTheDocument();
    expect(desktop.getByText("합류 전")).toBeInTheDocument();
    expect(desktop.queryByText("정식 멤버")).not.toBeInTheDocument();
    expect(desktop.queryByText("읽는사이")).not.toBeInTheDocument();
    expect(mobile.getByText("클럽 정보 없음")).toBeInTheDocument();
    expect(mobile.getByText("둘러보기 멤버")).toBeInTheDocument();
    expect(mobile.getByText("합류 전")).toBeInTheDocument();
    expect(mobile.queryByText("멤버 · 합류 전")).not.toBeInTheDocument();
    expect(mobile.queryByText("읽는사이")).not.toBeInTheDocument();
  });

  it("confirms and submits self leave", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    await user.click(scoped.getByRole("button", { name: "탈퇴" }));

    expect(
      scoped.getByText('탈퇴하면 과거 기록은 보존되며, 다른 멤버에게는 작성자가 "탈퇴한 멤버"로 표시됩니다.'),
    ).toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "탈퇴 확인" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/me/membership/leave",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ currentSessionPolicy: "APPLY_NOW" }),
      }),
    );
    expect(await scoped.findByRole("status")).toHaveTextContent("탈퇴 처리되었습니다.");
    expect(location.href).toBe("/about");
  });

  it("confirms self leave from the mobile my page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();
    const { container } = renderMyPage();
    const mobile = container.querySelector(".rm-my-mobile");
    expect(mobile).not.toBeNull();
    const scoped = within(mobile as HTMLElement);

    await user.click(scoped.getByRole("button", { name: "탈퇴" }));

    expect(
      scoped.getByText('탈퇴하면 과거 기록은 보존되며, 다른 멤버에게는 작성자가 "탈퇴한 멤버"로 표시됩니다.'),
    ).toBeInTheDocument();

    await user.click(scoped.getByRole("button", { name: "탈퇴 확인" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/me/membership/leave",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ currentSessionPolicy: "APPLY_NOW" }),
      }),
    );
    expect(await scoped.findByRole("status")).toHaveTextContent("탈퇴 처리되었습니다.");
    expect(location.href).toBe("/about");
  });

  it("matches standalone account metadata spacing", () => {
    const { container } = renderMyPage();
    const desktop = container.querySelector(".desktop-only") as HTMLElement;
    const metadata = desktop.querySelector(".rm-account-keyval") as HTMLElement;
    const firstLabel = metadata.querySelector("dt") as HTMLElement;

    expect(metadata).not.toBeNull();
    expect(metadata).toHaveStyle({
      columnGap: "16px",
      rowGap: "8px",
      fontSize: "13px",
    });
    expect(firstLabel).toHaveStyle({ alignSelf: "center" });
  });

  it("uses the standalone feedback document title style", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    expect(scoped.getByText("팩트풀니스")).toHaveClass("body");
    expect(scoped.getByText("2025.11.26 · 피드백 문서")).toHaveClass("tiny");
    expect(scoped.queryByText("독서모임 1차 피드백")).not.toBeInTheDocument();
  });

  it("renders real rhythm stats and an empty feedback document state when there are no reports", () => {
    const { container } = renderMyPage({ reports: pageOf([]) });
    const scoped = desktopScope(container);
    const rhythmSection = scoped.getByRole("heading", { level: 2, name: "나의 리듬" }).closest("section");
    const rhythm = within(rhythmSection as HTMLElement);

    expect(rhythm.getByText("참석")).toBeInTheDocument();
    expect(rhythm.getByText("6")).toBeInTheDocument();
    expect(rhythm.getByText("/13")).toBeInTheDocument();
    expect(rhythm.getByText("완독률")).toBeInTheDocument();
    expect(rhythm.getByText("46")).toBeInTheDocument();
    expect(rhythm.getByText("%")).toBeInTheDocument();
    expect(rhythm.getByText("질문")).toBeInTheDocument();
    expect(rhythm.getByText("7")).toBeInTheDocument();
    expect(rhythm.getByText("개")).toBeInTheDocument();
    expect(rhythm.getByText("서평")).toBeInTheDocument();
    expect(rhythm.getByText("3")).toBeInTheDocument();
    expect(rhythm.getByText("편")).toBeInTheDocument();
    expect(rhythm.getByText("최근 6회 참석")).toBeInTheDocument();
    expect(rhythm.getByText("No.8")).toBeInTheDocument();
    expect(rhythm.getByText("No.13")).toBeInTheDocument();
    expect(scoped.getByText("아직 열람 가능한 피드백 문서가 없습니다.")).toBeInTheDocument();
  });

  it("renders my page with an empty feedback list when viewer feedback documents are forbidden", async () => {
    installRouterRequestShim();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(
          jsonResponse({
            authenticated: true,
            userId: "member-user",
            membershipId: "member-membership",
            clubId: "club-id",
            email: "member@example.com",
            displayName: "멤버",
            accountName: "이멤버5",
            role: "MEMBER",
            membershipStatus: "ACTIVE",
            approvalState: "ACTIVE",
          }),
        );
      }

      if (url === "/api/bff/api/app/me") {
        return Promise.resolve(jsonResponse(data));
      }

      if (url === "/api/bff/api/feedback-documents/me?limit=30") {
        return Promise.resolve(jsonResponse({ message: "forbidden" }, 403));
      }

      if (url === "/api/bff/api/archive/me/questions?limit=30" || url === "/api/bff/api/archive/me/reviews?limit=30") {
        return Promise.resolve(jsonResponse(pageOf([])));
      }

      if (url === "/api/bff/api/me/notifications/preferences") {
        return Promise.resolve(jsonResponse(notificationPreferences));
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    const router = createMemoryRouter(
      [
        {
          path: "/app/me",
          element: <MyRoutePage />,
          loader: myPageLoader,
          hydrateFallbackElement: <div>내 공간을 불러오는 중</div>,
        },
      ],
      { initialEntries: ["/app/me"] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { level: 1, name: "계정과 기록" })).toBeInTheDocument();
    expect(screen.getAllByText("아직 열람 가능한 피드백 문서가 없습니다.")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "페이지를 불러오지 못했습니다." })).not.toBeInTheDocument();
  });

  it("does not infer recent attendance bars when the API has no recent attendance list", () => {
    const { container } = renderMyPage({
      data: {
        ...data,
        recentAttendances: [],
      },
    });
    const desktop = container.querySelector(".desktop-only") as HTMLElement;
    const scoped = within(desktop);

    expect(scoped.getByText("아직 최근 참석 데이터가 없습니다.")).toBeInTheDocument();
    expect(scoped.queryByText("최근 6회 참석")).not.toBeInTheDocument();
    expect(scoped.queryByText("No.8")).not.toBeInTheDocument();
    expect(scoped.queryByText("No.13")).not.toBeInTheDocument();
    expect(desktop.querySelectorAll(".rm-rhythm-attendance-bar")).toHaveLength(0);
  });

  it("uses larger standalone section titles", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    for (const title of ["계정", "알림", "나의 리듬", "개인 설정", "내가 남긴 문장", "피드백 문서"]) {
      expect(scoped.getByRole("heading", { level: 2, name: title })).toHaveClass("h2");
    }
  });
});
