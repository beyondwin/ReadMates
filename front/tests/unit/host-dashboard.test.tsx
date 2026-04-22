import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HostDashboard, { type HostDashboardActions } from "@/features/host/components/host-dashboard";
import {
  hostDashboardLoader,
  hostInvitationsLoader,
  hostMembersLoader,
  hostSessionEditorLoader,
} from "@/features/host";
import type { CurrentSessionResponse, HostDashboardResponse } from "@/features/host/api/host-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

const hostAuth: AuthMeResponse = {
  authenticated: true,
  userId: "user-host",
  membershipId: "membership-host",
  clubId: "club-1",
  email: "host@example.com",
  displayName: "김호스트",
  shortName: "우",
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
  shortName: "멤",
  role: "MEMBER",
};

const anonymousAuth: AuthMeResponse = {
  authenticated: false,
  userId: null,
  membershipId: null,
  clubId: null,
  email: null,
  displayName: null,
  shortName: null,
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
    myRsvpStatus: "NO_RESPONSE",
    myCheckin: null,
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
        },
        {
          priority: 2,
          text: "두 번째 질문",
          draftThought: null,
          authorName: "김호스트",
          authorShortName: "우",
        },
      ],
      checkins: [
        {
          authorName: "안멤버1",
          authorShortName: "멤버1",
          readingProgress: 62,
          note: "읽는 중",
        },
      ],
      highlights: [],
    },
    attendees: [
      {
        membershipId: "membership-host",
        displayName: "김호스트",
        shortName: "우",
        role: "HOST",
        rsvpStatus: "NO_RESPONSE",
        attendanceStatus: "UNKNOWN",
      },
      {
        membershipId: "membership-member",
        displayName: "안멤버1",
        shortName: "멤버1",
        role: "MEMBER",
        rsvpStatus: "GOING",
        attendanceStatus: "UNKNOWN",
      },
    ],
  },
};

const noopHostDashboardActions = {
  updateCurrentSessionParticipation: vi.fn(async () => undefined),
} satisfies HostDashboardActions;

type HostDashboardProps = Parameters<typeof HostDashboard>[0];

function HostDashboardForTest({
  actions,
  ...props
}: Omit<HostDashboardProps, "actions"> & { actions?: HostDashboardActions }) {
  return <HostDashboard {...props} actions={actions ?? noopHostDashboardActions} />;
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

function hostSessionEditorLoaderForTest() {
  return hostSessionEditorLoader({
    params: { sessionId: "session-7" },
    request: new Request("https://readmates.test/app/host/sessions/session-7/edit"),
  } as unknown as Parameters<typeof hostSessionEditorLoader>[0]);
}

describe("HostDashboard", () => {
  it.each([
    ["dashboard", () => hostDashboardLoader()],
    ["members", () => hostMembersLoader()],
    ["invitations", () => hostInvitationsLoader()],
    ["session editor", hostSessionEditorLoaderForTest],
  ])("redirects anonymous users before calling %s host endpoints", async (_name, runLoader) => {
    const fetchMock = vi.fn().mockResolvedValue(authResponse(anonymousAuth));
    vi.stubGlobal("fetch", fetchMock);

    await expectLoaderRedirect(runLoader, "/login");

    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/me", expect.objectContaining({ cache: "no-store" }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/bff/api/host/"))).toBe(false);
  });

  it.each([
    ["dashboard", () => hostDashboardLoader()],
    ["members", () => hostMembersLoader()],
    ["invitations", () => hostInvitationsLoader()],
    ["session editor", hostSessionEditorLoaderForTest],
  ])("redirects non-host users before calling %s host endpoints", async (_name, runLoader) => {
    const fetchMock = vi.fn().mockResolvedValue(authResponse(memberAuth));
    vi.stubGlobal("fetch", fetchMock);

    await expectLoaderRedirect(runLoader, "/app");

    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/me", expect.objectContaining({ cache: "no-store" }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/bff/api/host/"))).toBe(false);
  });

  it("shows no-session fallbacks when there is no current session and no pending work", () => {
    const { container } = render(<HostDashboardForTest current={{ currentSession: null }} data={emptyDashboard} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getAllByText("대기 없음").length).toBeGreaterThanOrEqual(4);
    expect(mobile.getAllByText("대기 없음").length).toBeGreaterThanOrEqual(4);
    expect(desktop.getByText("세션을 만들면 참석 현황이 표시됩니다.")).toBeInTheDocument();
    expect(mobile.getByText("세션을 만들면 참석 현황이 표시됩니다.")).toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "멤버 화면으로" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "멤버 화면으로" })).not.toBeInTheDocument();
    const desktopNewSessionLinks = desktop.getAllByRole("link", { name: "새 세션 만들기" });
    const mobileNewSessionLinks = mobile.getAllByRole("link", { name: "새 세션 만들기" });
    expect(desktopNewSessionLinks).toHaveLength(1);
    expect(mobileNewSessionLinks).toHaveLength(1);
    expect(desktopNewSessionLinks[0]).toHaveAttribute("href", "/app/host/sessions/new");
    expect(mobileNewSessionLinks[0]).toHaveAttribute("href", "/app/host/sessions/new");
    expect(desktop.getByText("아래 세션 준비 문서에서 새 세션 만들기를 사용하세요.")).toBeInTheDocument();
    expect(mobile.getByText("아래 세션 준비 문서에서 새 세션 만들기를 사용하세요.")).toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expectDisabledActionInViews(desktop, mobile, /공개 요약 편집.*공개 대기 건수는 여러 세션을 합산한 값/);
    expectDisabledActionInViews(desktop, mobile, /피드백 문서 등록.*피드백 문서 대기 건수는 여러 세션을 합산한 값/);
    expectDisabledActionInViews(desktop, mobile, /참석 확정 마감.*현재 세션을 먼저 만든 뒤 사용할 수 있습니다/);

    const desktopSessionBasics = desktop.getByText("책 정보와 일정 점검").closest("li");
    expect(desktopSessionBasics).not.toBeNull();
    expect(within(desktopSessionBasics as HTMLElement).getByText("세션을 만들면 상태를 확인할 수 있습니다.")).toBeInTheDocument();
    expect(within(desktopSessionBasics as HTMLElement).getByText("안내")).toBeInTheDocument();
    expect(desktop.getByText("세션을 만들면 RSVP와 미팅 URL을 확인할 수 있습니다.")).toBeInTheDocument();
    expect(mobile.getByText("세션을 만들면 RSVP와 미팅 URL을 확인할 수 있습니다.")).toBeInTheDocument();
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

    expect(desktop.getByText("운영 원장")).toBeInTheDocument();
    expect(desktop.getByText("운영 원장 · 호스트")).toBeInTheDocument();
    expect(desktop.getAllByText("확인 필요").length).toBeGreaterThan(0);
    expect(desktop.getByText("세션 준비 문서")).toBeInTheDocument();
    expect(desktop.getByText("운영 일정")).toBeInTheDocument();
    expect(desktop.getByText("멤버 참여 · 이번 세션")).toBeInTheDocument();
    expect(desktop.getByText("운영 액션 목록")).toBeInTheDocument();
    expect(desktop.getByText("초대 파이프라인")).toBeInTheDocument();
    expect(mobile.getByText("운영 원장 · 호스트")).toBeInTheDocument();
    expect(mobile.getByText("운영 원장")).toBeInTheDocument();
    expect(mobile.getAllByText("확인 필요").length).toBeGreaterThan(0);
    expect(mobile.getAllByText("세션 준비 문서").length).toBeGreaterThan(0);
    expect(mobile.getByText("운영 일정")).toBeInTheDocument();
    expect(mobile.getByText("멤버 참여")).toBeInTheDocument();
    expect(mobile.getByText("운영 액션 목록")).toBeInTheDocument();
    expect(desktop.getByText("RSVP 미응답")).toBeInTheDocument();
    expect(desktop.getByText("체크인 미작성")).toBeInTheDocument();
    expect(desktop.getByText("공개 대기")).toBeInTheDocument();
    expect(desktop.getByText("피드백 문서 등록 대기")).toBeInTheDocument();
    expect(mobile.getByText("체크인 미작성")).toBeInTheDocument();
    expect(mobile.getByText("공개 대기")).toBeInTheDocument();
    expect(mobile.getByText("피드백 문서 등록 대기")).toBeInTheDocument();
    expect(desktop.getByText("3")).toBeInTheDocument();
    expect(desktop.getByText("4")).toBeInTheDocument();
    expect(desktop.getByText("2")).toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "+ 새 세션" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "멤버 초대" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "멤버 화면으로" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "멤버 화면으로" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expectDisabledActionInViews(desktop, mobile, /공개 요약 편집.*공개 대기 건수는 여러 세션을 합산한 값/);
    expectDisabledActionInViews(desktop, mobile, /피드백 문서 등록.*피드백 문서 대기 건수는 여러 세션을 합산한 값/);
    expectDisabledActionInViews(desktop, mobile, /참석 확정 마감.*현재 세션을 먼저 만든 뒤 사용할 수 있습니다/);
    expectDisabledActionInViews(desktop, mobile, /질문 마감 리마인더 발송.*리마인더 발송 기능이 아직 연결되지 않아 사용할 수 없습니다/);
    expectDisabledActionInViews(desktop, mobile, /지금 발송.*리마인더 발송 기능이 아직 연결되지 않아 사용할 수 없습니다/);
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
    const feedbackCard = desktop.getByText("회차 피드백 문서 업로드가 필요합니다.").closest(".row-between");

    expect(feedbackCard).not.toBeNull();
    const statusBadge = within(feedbackCard as HTMLElement).getByText("1개 대기");
    expect(statusBadge).toHaveClass("badge-warn");
    expect(statusBadge).not.toHaveClass("badge-ok");
  });

  it("keeps aggregate publication next actions out of the current session editor", () => {
    const { container } = render(
      <HostDashboardForTest current={current} data={{ ...emptyDashboard, publishPending: 1 }} />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);
    const desktopAction = desktop.getByRole("heading", { name: "공개 요약 정리" }).closest("section");
    const mobileAction = mobile.getByRole("heading", { name: "공개 요약 정리" }).closest("section");

    expect(desktopAction).not.toBeNull();
    expect(mobileAction).not.toBeNull();
    expect(within(desktopAction as HTMLElement).queryByRole("link")).not.toBeInTheDocument();
    expect(within(mobileAction as HTMLElement).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(desktopAction as HTMLElement).getByText(
        "공개 대기 건수는 여러 세션을 합산한 값입니다. 현재 열린 세션으로 바로 이동하지 말고 세션 기록에서 정확한 회차를 선택하세요.",
      ),
    ).toBeInTheDocument();
    expect(
      within(mobileAction as HTMLElement).getByRole("button", {
        name: /세션 기록에서 선택.*대시보드는 집계 건수만 제공하므로 특정 세션 편집 화면을 바로 열 수 없습니다/,
      }),
    ).toBeDisabled();
  });

  it("does not derive the current-session status metric from aggregate publication backlog", () => {
    vi.setSystemTime(new Date(2026, 4, 17, 12));

    const { container } = render(<HostDashboardForTest current={current} data={{ ...emptyDashboard, publishPending: 7 }} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);
    const desktopSessionCard = desktop.getByRole("heading", { name: "테스트 책" }).closest("article");
    const mobileSessionCard = mobile.getByRole("heading", { name: "테스트 책" }).closest("article");

    expect(desktopSessionCard).not.toBeNull();
    expect(mobileSessionCard).not.toBeNull();

    const desktopStatusMetric = within(desktopSessionCard as HTMLElement).getByText("상태").parentElement;
    const mobileStatusMetric = within(mobileSessionCard as HTMLElement).getByText("상태").parentElement;

    expect(desktopStatusMetric).toHaveTextContent("준비 중");
    expect(mobileStatusMetric).toHaveTextContent("준비 중");
    expect(desktopStatusMetric).not.toHaveTextContent("대기");
    expect(mobileStatusMetric).not.toHaveTextContent("대기");
    expect(within(desktopSessionCard as HTMLElement).queryByText("공개")).not.toBeInTheDocument();
    expect(within(mobileSessionCard as HTMLElement).queryByText("공개")).not.toBeInTheDocument();
  });

  it("keeps aggregate feedback next actions out of the current session editor", () => {
    const { container } = render(
      <HostDashboardForTest current={current} data={{ ...emptyDashboard, feedbackPending: 1 }} />,
    );
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);
    const desktopAction = desktop.getByRole("heading", { name: "피드백 문서 등록" }).closest("section");
    const mobileAction = mobile.getByRole("heading", { name: "피드백 문서 등록" }).closest("section");

    expect(desktopAction).not.toBeNull();
    expect(mobileAction).not.toBeNull();
    expect(within(desktopAction as HTMLElement).queryByRole("link")).not.toBeInTheDocument();
    expect(within(mobileAction as HTMLElement).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(desktopAction as HTMLElement).getByText(
        "피드백 문서 대기 건수는 여러 세션을 합산한 값입니다. 현재 열린 세션으로 바로 이동하지 말고 세션 기록에서 정확한 회차를 선택하세요.",
      ),
    ).toBeInTheDocument();
    expect(
      within(mobileAction as HTMLElement).getByRole("button", {
        name: /세션 기록에서 선택.*대시보드는 집계 건수만 제공하므로 특정 세션 편집 화면을 바로 열 수 없습니다/,
      }),
    ).toBeDisabled();
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

    expect(mobile.getByText("운영 원장 · 김호스트")).toBeInTheDocument();
    expect(mobile.getByText("운영 원장")).toBeInTheDocument();
    expect(mobile.getByText("세션 준비, 멤버 참여, 공개 기록, 초대 흐름을 작업 순서대로 확인합니다.")).toBeInTheDocument();

    const orderedLabels = [
      "오늘의 운영 판단",
      "RSVP 미응답",
      "체크인 미작성",
      "공개 대기",
      "피드백 문서 등록 대기",
      "다음 운영 액션",
      "세션 준비 문서",
      "운영 일정",
      "멤버 참여",
      "공개 · 피드백",
      "초대 파이프라인",
      "운영 액션 목록",
    ];
    const html = container.querySelector(".rm-host-dashboard-mobile")?.textContent ?? "";
    let cursor = -1;
    for (const label of orderedLabels) {
      const next = html.indexOf(label, cursor + 1);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }

    expect(mobile.getByText("No.07 · D-3")).toBeInTheDocument();
    expect(mobile.getByRole("group", { name: /No.07 · 이번 세션 · 준비 중 · D-3/ })).toBeInTheDocument();
    expect(mobile.getByText("2026.05.20 · 20:00")).toBeInTheDocument();
    expect(mobile.getByRole("link", { name: "세션 문서 편집" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expect(mobile.getByText("질문").parentElement).toHaveTextContent("2/10");
    expect(mobile.getByText("체크인").parentElement).toHaveTextContent("1/2");
    expect(mobile.getByText("김호스트")).toBeInTheDocument();
    expect(mobile.getByText("안멤버1")).toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(mobile.getByRole("button", { name: /공개 요약 편집.*공개 대기 건수는 여러 세션을 합산한 값/ })).toBeDisabled();
    expect(mobile.getByRole("link", { name: "참석 확정 마감" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expect(mobile.getByRole("button", { name: /질문 마감 리마인더 발송.*리마인더 발송 기능이 아직 연결되지 않아 사용할 수 없습니다/ })).toBeDisabled();
  });

  it("uses the host two-column override for mobile rows with only label and value", () => {
    const { container } = render(<HostDashboardForTest auth={hostAuth} current={current} data={dashboard} />);
    const mobile = getMobileView(container);
    const metricRow = mobile.getByText("RSVP 미응답").closest(".m-list-row");
    const publicationRow = mobile.getByText("공개 요약과 하이라이트 편집이 필요합니다.").closest(".m-list-row");

    expect(metricRow).not.toBeNull();
    expect(publicationRow).not.toBeNull();
    expect(metricRow).toHaveClass("rm-host-dashboard-mobile__two-column-row");
    expect(publicationRow).toHaveClass("rm-host-dashboard-mobile__two-column-row");
  });

  it("links the current session action to the host edit page", () => {
    vi.setSystemTime(new Date(2026, 4, 17, 12));

    const { container } = render(<HostDashboardForTest current={current} data={dashboard} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getByText("김호스트")).toBeInTheDocument();
    expect(desktop.getByText("안멤버1")).toBeInTheDocument();
    expect(desktop.getByText("No.07 · D-3")).toBeInTheDocument();
    expect(desktop.getByRole("group", { name: /No.07 · 이번 세션 · 준비 중 · D-3/ })).toBeInTheDocument();
    expect(desktop.getByText("2026.05.20 20:00 · 온라인")).toBeInTheDocument();
    expect(desktop.getByText("질문").parentElement).toHaveTextContent("2/10");
    expect(desktop.getByText("체크인").parentElement).toHaveTextContent("1/2");
    expect(desktop.getByRole("img", { name: "테스트 책 표지" })).toHaveAttribute(
      "src",
      "https://example.com/covers/test-book.jpg",
    );
    expect(desktop.getByText("참석 응답과 미팅 URL 점검")).toBeInTheDocument();
    expect(desktop.getByText("미응답")).toBeInTheDocument();
    expect(desktop.getByText("참석 · 62%")).toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "세션 문서 편집" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expect(desktop.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "피드백 문서 등록" })).not.toBeInTheDocument();
    expectDisabledActionInViews(desktop, mobile, /공개 요약 편집.*공개 대기 건수는 여러 세션을 합산한 값/);
    expectDisabledActionInViews(desktop, mobile, /피드백 문서 등록.*피드백 문서 대기 건수는 여러 세션을 합산한 값/);
    expect(desktop.getByRole("link", { name: "참석 확정 마감" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expectDisabledActionInViews(desktop, mobile, /질문 마감 리마인더 발송.*리마인더 발송 기능이 아직 연결되지 않아 사용할 수 없습니다/);
    expectDisabledActionInViews(desktop, mobile, /지금 발송.*리마인더 발송 기능이 아직 연결되지 않아 사용할 수 없습니다/);
    expect(desktop.getByText("3")).toBeInTheDocument();
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
    expect(mobile.getByRole("link", { name: "세션 문서 편집" })).toHaveAttribute("href", expectedHref);
    expect(desktop.getByRole("link", { name: "참석 확정 마감" })).toHaveAttribute("href", expectedHref);
    expect(mobile.getByRole("link", { name: "참석 확정 마감" })).toHaveAttribute("href", expectedHref);
    expect(desktop.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
  });

  it("normalizes negative check-in metric counts for current sessions", () => {
    const { container } = render(<HostDashboardForTest current={current} data={{ ...dashboard, checkinMissing: -1 }} />);
    const desktop = getDesktopView(container);

    expect(screen.queryByText("-1명 미작성")).not.toBeInTheDocument();
    expect(desktop.getByText("체크인").parentElement).toHaveTextContent("1/2");
  });
});
