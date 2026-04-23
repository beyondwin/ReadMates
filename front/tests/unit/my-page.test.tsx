import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CSSProperties, ReactNode } from "react";
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedbackDocumentListItem, MyPageResponse } from "@/features/archive/api/archive-contracts";
import { myPageLoader } from "@/features/archive/route/my-page-data";
import MyPage from "@/features/archive/ui/my-page";
import MyRoutePage from "@/src/pages/my-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type MyPageProps = Parameters<typeof MyPage>[0];

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
  displayName: "김호스트",
  shortName: "우",
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
const reportReadLabel = "No.01 팩트풀니스 · 독서모임 1차 피드백 읽기";
const reportPdfLabel = "No.01 팩트풀니스 · 독서모임 1차 피드백 PDF로 저장";

function renderMyPage(overrides: Partial<MyPageProps> = {}) {
  const props: MyPageProps = {
    data,
    reports,
    reviewCount: 3,
    questionCount: 7,
    LogoutButtonComponent: TestLogoutButton,
    onLeaveMembership: testLeaveMembership,
    ...overrides,
  };

  return render(<MyPage {...props} />);
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
  it("shows account, rhythm, and feedback document sections", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    expect(scoped.getByRole("heading", { level: 1, name: "내 공간" })).toBeInTheDocument();
    expect(scoped.queryByText("My")).not.toBeInTheDocument();
    expect(scoped.queryByText("내 서가 · 계정")).not.toBeInTheDocument();
    expect(scoped.getByText("계정")).toBeInTheDocument();
    expect(scoped.getByText("김호스트")).toBeInTheDocument();
    expect(scoped.getByText("host@example.com")).toBeInTheDocument();
    expect(scoped.getByText("호스트")).toBeInTheDocument();
    expect(scoped.getByText("읽는사이")).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(scoped.getByText("나의 리듬")).toBeInTheDocument();
    expect(scoped.getByText("피드백 문서")).toBeInTheDocument();
    expect(scoped.getByText("내가 남긴 문장")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: /모임 전에 꺼낸 질문과 초안/ })).toHaveAttribute("href", "/app/archive?view=questions");
    expect(scoped.getByRole("link", { name: /한줄평과 장문 서평/ })).toHaveAttribute("href", "/app/archive?view=reviews");
    expect(scoped.getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/app/archive?view=report");
    expect(scoped.getByText("팩트풀니스")).toBeInTheDocument();
    expect(scoped.getByText("2025.11")).toBeInTheDocument();
    expect(scoped.getByText("2025.11.26 · PDF")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: reportReadLabel })).toHaveAttribute("href", "/app/feedback/session-1");
    expect(scoped.getByRole("link", { name: reportPdfLabel })).toHaveAttribute(
      "href",
      "/app/feedback/session-1/print",
    );
    expect(scoped.queryByText("읽기")).not.toBeInTheDocument();
    expect(scoped.queryByText("PDF로 저장")).not.toBeInTheDocument();
    expect(scoped.queryByText("물고기는 존재하지 않는다")).not.toBeInTheDocument();
    expect(scoped.queryByText("feedback-13.html")).not.toBeInTheDocument();
  });

  it("encodes feedback document links from my page reports", () => {
    const { container } = renderMyPage({
      reports: [
        {
          ...reports[0],
          sessionId: "session 1/slash",
        },
      ],
    });
    const scoped = desktopScope(container);

    expect(scoped.getByRole("link", { name: reportReadLabel })).toHaveAttribute(
      "href",
      "/app/feedback/session%201%2Fslash",
    );
    expect(scoped.getByRole("link", { name: reportPdfLabel })).toHaveAttribute(
      "href",
      "/app/feedback/session%201%2Fslash/print",
    );
  });

  it("renders the standalone-aligned mobile my page shell", () => {
    const { container } = renderMyPage();

    const mobile = container.querySelector(".rm-my-mobile");
    expect(mobile).not.toBeNull();
    const scoped = within(mobile as HTMLElement);

    expect(scoped.queryByText("내 서가 · 계정")).not.toBeInTheDocument();
    expect(scoped.getByText("김호스트")).toBeInTheDocument();
    expect(scoped.getByText("host@example.com")).toBeInTheDocument();
    expect(scoped.getByText("6")).toBeInTheDocument();
    expect(scoped.getByText("참석")).toBeInTheDocument();
    expect(scoped.getByText("3")).toBeInTheDocument();
    expect(scoped.getByText("서평")).toBeInTheDocument();
    expect(scoped.getByText("7")).toBeInTheDocument();
    expect(scoped.getByText("질문")).toBeInTheDocument();
    expect(scoped.getByText("클럽")).toBeInTheDocument();
    expect(scoped.getByText("읽는사이")).toBeInTheDocument();
    expect(scoped.getByText("호스트 · 2025.11 합류")).toBeInTheDocument();
    expect(scoped.getByText("내 글")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: "질문 7" })).toHaveAttribute("href", "/app/archive?view=questions");
    expect(scoped.getByRole("link", { name: "서평 3" })).toHaveAttribute("href", "/app/archive?view=reviews");
    expect(scoped.getByText("읽기 전용 설정")).toBeInTheDocument();
    expect(scoped.getByText("알림")).toBeInTheDocument();
    expect(scoped.getByText("캘린더 연동")).toBeInTheDocument();
    expect(scoped.getByText("테마 · 표시")).toBeInTheDocument();
    expect(scoped.getByText("연결 안 됨")).toBeInTheDocument();
    expect(scoped.getByText("라이트")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/app/archive?view=report");
    expect(scoped.getByText("팩트풀니스")).toBeInTheDocument();
    expect(scoped.getByText("No.01 · 2025.11.26")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: reportReadLabel })).toHaveAttribute("href", "/app/feedback/session-1");
    expect(scoped.getByRole("link", { name: reportPdfLabel })).toHaveAttribute("href", "/app/feedback/session-1/print");
    expect(scoped.getAllByText("준비 중")).toHaveLength(4);
    expect(scoped.getByText("클럽 탈퇴 · 내 기록은 유지, 내 이름은 비공개 처리됩니다.")).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "탈퇴" })).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(mobile?.querySelector(".m-card")).not.toBeNull();
    expect(mobile?.querySelectorAll(".m-list")).toHaveLength(3);
  });

  it("passes my page return state from mobile feedback document links", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={["/app/me"]}>
        <Routes>
          <Route
            path="/app/me"
            element={
              <MyPage
                data={data}
                reports={reports}
                reviewCount={3}
                questionCount={7}
                LogoutButtonComponent={TestLogoutButton}
                onLeaveMembership={testLeaveMembership}
              />
            }
          />
          <Route path="/app/feedback/:sessionId" element={<LocationStateEcho />} />
        </Routes>
      </MemoryRouter>,
    );
    const mobile = within(container.querySelector(".rm-my-mobile") as HTMLElement);

    await user.click(mobile.getByRole("link", { name: reportReadLabel }));

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
    expect(scoped.getByText("다음 모임 7일 전 리마인더")).toBeInTheDocument();
    expect(scoped.getByText("책·일정·미팅 URL")).toBeInTheDocument();
    expect(scoped.getByText("질문 마감 전날 알림")).toBeInTheDocument();
    expect(scoped.getByText("개인 설정")).toBeInTheDocument();
    expect(scoped.getByText("표시 이름")).toBeInTheDocument();
    expect(scoped.getByText("기록 공개 범위")).toBeInTheDocument();
    expect(scoped.getByText("클럽 탈퇴 · 내 기록은 유지, 내 이름은 비공개 처리됩니다.")).toBeInTheDocument();
  });

  it("renders notifications as read-only pending status rows", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);
    const reminderRow = scoped.getByText("다음 모임 7일 전 리마인더").closest(".row-between") as HTMLElement;
    const reviewRow = scoped.getByText("다른 멤버의 서평 공개").closest(".row-between") as HTMLElement;

    expect(scoped.queryAllByRole("switch")).toHaveLength(0);
    expect(within(reminderRow).getByText("준비 중")).toBeInTheDocument();
    expect(within(reviewRow).getByText("준비 중")).toBeInTheDocument();
    expect(scoped.getByLabelText("다음 모임 7일 전 리마인더 알림 설정 준비 중")).toBeInTheDocument();
    expect(scoped.getByLabelText("다른 멤버의 서평 공개 알림 설정 준비 중")).toBeInTheDocument();
  });

  it("uses contextual names for read-only account preference states", () => {
    const { container } = renderMyPage();
    const scoped = desktopScope(container);

    expect(scoped.getByText("김호스트 · @host")).toBeInTheDocument();
    expect(scoped.queryByText("김호스트 · host@example.com · @host")).not.toBeInTheDocument();
    expect(scoped.getByText("프로필 수정 준비 중")).toBeInTheDocument();
    expect(scoped.getAllByText("변경 준비 중")).toHaveLength(3);
    expect(scoped.getByLabelText("표시 이름 변경 준비 중")).toBeInTheDocument();
    expect(scoped.getByLabelText("기록 공개 범위 변경 준비 중")).toBeInTheDocument();
    expect(scoped.getByLabelText("언어 변경 준비 중")).toBeInTheDocument();
    expect(scoped.queryByRole("button", { name: "표시 이름 변경" })).not.toBeInTheDocument();
    expect(scoped.queryByRole("button", { name: "기록 공개 범위 변경" })).not.toBeInTheDocument();
    expect(scoped.queryByRole("button", { name: "언어 변경" })).not.toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "탈퇴" })).toBeInTheDocument();
  });

  it("derives viewer identity without a hard-coded club name", () => {
    const viewerData: MyPageResponse = {
      ...data,
      displayName: "Viewer Member",
      shortName: "Viewer",
      email: "viewer@example.com",
      role: "MEMBER",
      membershipStatus: "VIEWER",
      clubName: null,
      joinedAt: "",
      sessionCount: 0,
      totalSessionCount: 6,
      recentAttendances: [],
    };
    const { container } = renderMyPage({ data: viewerData, reports: [], reviewCount: 0, questionCount: 0 });
    const desktop = desktopScope(container);
    const mobile = within(container.querySelector(".rm-my-mobile") as HTMLElement);

    expect(desktop.getByText("둘러보기 멤버")).toBeInTheDocument();
    expect(desktop.getByText("클럽 정보 없음")).toBeInTheDocument();
    expect(desktop.getByText("합류 전")).toBeInTheDocument();
    expect(desktop.queryByText("정식 멤버")).not.toBeInTheDocument();
    expect(desktop.queryByText("읽는사이")).not.toBeInTheDocument();
    expect(mobile.getByText("클럽 정보 없음")).toBeInTheDocument();
    expect(mobile.getByText("둘러보기 멤버 · 합류 전")).toBeInTheDocument();
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
    expect(scoped.getByText("2025.11.26 · PDF")).toHaveClass("tiny");
    expect(scoped.queryByText("독서모임 1차 피드백")).not.toBeInTheDocument();
  });

  it("renders real rhythm stats and an empty feedback document state when there are no reports", () => {
    const { container } = renderMyPage({ reports: [] });
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
            displayName: "이멤버5",
            shortName: "멤버",
            role: "MEMBER",
            membershipStatus: "ACTIVE",
            approvalState: "ACTIVE",
          }),
        );
      }

      if (url === "/api/bff/api/app/me") {
        return Promise.resolve(jsonResponse(data));
      }

      if (url === "/api/bff/api/feedback-documents/me") {
        return Promise.resolve(jsonResponse({ message: "forbidden" }, 403));
      }

      if (url === "/api/bff/api/archive/me/questions" || url === "/api/bff/api/archive/me/reviews") {
        return Promise.resolve(jsonResponse([]));
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

    expect(await screen.findByRole("heading", { level: 1, name: "내 공간" })).toBeInTheDocument();
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
