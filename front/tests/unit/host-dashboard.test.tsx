import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HostDashboard from "@/features/host/components/host-dashboard";
import type { AuthMeResponse, CurrentSessionResponse, HostDashboardResponse } from "@/shared/api/readmates";

afterEach(() => {
  cleanup();
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

describe("HostDashboard", () => {
  it("shows no-session fallbacks when there is no current session and no pending work", () => {
    const { container } = render(<HostDashboard current={{ currentSession: null }} data={emptyDashboard} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getAllByText("대기 없음")).toHaveLength(4);
    expect(mobile.getAllByText("대기 없음")).toHaveLength(4);
    expect(desktop.getByText("세션을 만들면 참석 현황이 표시됩니다.")).toBeInTheDocument();
    expect(mobile.getByText("세션을 만들면 참석 현황이 표시됩니다.")).toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", "/app");
    expect(mobile.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", "/app");
    expect(desktop.getByRole("link", { name: "새 세션 만들기" })).toHaveAttribute("href", "/app/host/sessions/new");
    expect(mobile.getByRole("link", { name: "세션 편집" })).toHaveAttribute("href", "/app/host/sessions/new");
    expect(desktop.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expectDisabledActionInViews(desktop, mobile, /공개 요약 편집.*현재 세션을 먼저 만든 뒤 사용할 수 있습니다/);
    expectDisabledActionInViews(desktop, mobile, /피드백 문서 등록.*현재 세션을 먼저 만든 뒤 사용할 수 있습니다/);
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
      <HostDashboard
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
    const { container } = render(<HostDashboard data={dashboard} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getByText("운영 대시보드")).toBeInTheDocument();
    expect(desktop.getByText("운영 · 호스트")).toBeInTheDocument();
    expect(desktop.getAllByText("확인 필요").length).toBeGreaterThan(0);
    expect(desktop.getByText("이번 세션")).toBeInTheDocument();
    expect(desktop.getByText("운영 일정")).toBeInTheDocument();
    expect(desktop.getByText("멤버 상태 · 이번 세션")).toBeInTheDocument();
    expect(desktop.getByText("빠른 액션")).toBeInTheDocument();
    expect(mobile.getByText("운영 · 호스트")).toBeInTheDocument();
    expect(mobile.getByText("운영 대시보드")).toBeInTheDocument();
    expect(mobile.getAllByText("확인 필요").length).toBeGreaterThan(0);
    expect(mobile.getAllByText("이번 세션").length).toBeGreaterThan(0);
    expect(mobile.getByText("운영 일정")).toBeInTheDocument();
    expect(mobile.getByText("멤버 상태")).toBeInTheDocument();
    expect(mobile.getByText("빠른 액션")).toBeInTheDocument();
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
    expect(desktop.getByRole("link", { name: "+ 새 세션" })).toHaveAttribute("href", "/app/host/sessions/new");
    expect(desktop.getByRole("link", { name: "멤버 초대" })).toHaveAttribute("href", "/app/host/invitations");
    expect(desktop.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "공개 요약 편집" })).not.toBeInTheDocument();
    expectDisabledActionInViews(desktop, mobile, /공개 요약 편집.*현재 세션을 먼저 만든 뒤 사용할 수 있습니다/);
    expectDisabledActionInViews(desktop, mobile, /피드백 문서 등록.*현재 세션을 먼저 만든 뒤 사용할 수 있습니다/);
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
    const { container } = render(<HostDashboard current={current} data={{ ...emptyDashboard, feedbackPending: 1 }} />);
    const desktop = getDesktopView(container);
    const feedbackCard = desktop.getByText("피드백 문서 등록 대기").closest("article");

    expect(feedbackCard).not.toBeNull();
    const statusBadge = within(feedbackCard as HTMLElement).getByText("할 일");
    expect(statusBadge).toHaveClass("badge-warn");
    expect(statusBadge).not.toHaveClass("badge-ok");
  });

  it("shows current-session missing member alerts when the dashboard payload includes them", () => {
    const { container } = render(
      <HostDashboard
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <HostDashboard
        current={current}
        data={{
          ...dashboard,
          currentSessionMissingMemberCount: 1,
          currentSessionMissingMembers: [{ membershipId: "membership-new", displayName: "새 멤버", email: "new@example.com" }],
        }}
      />,
    );
    const desktop = getDesktopView(container);

    await user.click(desktop.getByRole("button", { name: "이번 세션에 추가" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/members/membership-new/current-session/add",
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() => expect(screen.queryByText("새 멤버 1명이 현재 세션에 아직 없습니다.")).not.toBeInTheDocument());
  });

  it("marks a missing member for next session from the dashboard alert", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <HostDashboard
        current={current}
        data={{
          ...dashboard,
          currentSessionMissingMemberCount: 1,
          currentSessionMissingMembers: [{ membershipId: "membership-new", displayName: "새 멤버", email: "new@example.com" }],
        }}
      />,
    );
    const desktop = getDesktopView(container);

    await user.click(desktop.getByRole("button", { name: "다음 세션부터" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/members/membership-new/current-session/remove",
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() => expect(screen.queryByText("새 멤버 1명이 현재 세션에 아직 없습니다.")).not.toBeInTheDocument());
  });

  it("renders the mobile host operations flow in the baseline order", () => {
    vi.setSystemTime(new Date(2026, 4, 17, 12));

    const { container } = render(<HostDashboard auth={hostAuth} current={current} data={dashboard} />);
    const mobile = getMobileView(container);

    expect(mobile.getByText("운영 · 김호스트")).toBeInTheDocument();
    expect(mobile.getByText("운영 대시보드")).toBeInTheDocument();
    expect(mobile.getByText("오늘의 할 일과 다음 모임을 한눈에.")).toBeInTheDocument();

    const orderedLabels = [
      "확인 필요",
      "RSVP 미응답",
      "체크인 미작성",
      "공개 대기",
      "피드백 문서 등록 대기",
      "이번 세션",
      "운영 일정",
      "멤버 상태",
      "빠른 액션",
    ];
    const html = container.querySelector(".rm-host-dashboard-mobile")?.textContent ?? "";
    let cursor = -1;
    for (const label of orderedLabels) {
      const next = html.indexOf(label);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }

    expect(mobile.getByText("No.07 · D-3")).toBeInTheDocument();
    expect(mobile.getByText("2026.05.20 · 20:00")).toBeInTheDocument();
    expect(mobile.getByRole("link", { name: "세션 편집" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expect(mobile.getByText("질문").parentElement).toHaveTextContent("2/10");
    expect(mobile.getByText("체크인").parentElement).toHaveTextContent("1/2");
    expect(mobile.getByText("김호스트")).toBeInTheDocument();
    expect(mobile.getByText("안멤버1")).toBeInTheDocument();
    expect(mobile.getByRole("link", { name: "공개 요약 편집" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expect(mobile.getByRole("button", { name: /질문 마감 리마인더 발송.*리마인더 발송 기능이 아직 연결되지 않아 사용할 수 없습니다/ })).toBeDisabled();
  });

  it("links the current session action to the host edit page", () => {
    vi.setSystemTime(new Date(2026, 4, 17, 12));

    const { container } = render(<HostDashboard current={current} data={dashboard} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);

    expect(desktop.getByText("김호스트")).toBeInTheDocument();
    expect(desktop.getByText("안멤버1")).toBeInTheDocument();
    expect(desktop.getByText("No.07 · D-3")).toBeInTheDocument();
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
    expect(desktop.getByRole("link", { name: "확인" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expect(desktop.getByRole("link", { name: "공개 요약 편집" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expect(desktop.getByRole("link", { name: "피드백 문서 등록" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expect(desktop.getByRole("link", { name: "참석 확정 마감" })).toHaveAttribute("href", "/app/host/sessions/session-7/edit");
    expectDisabledActionInViews(desktop, mobile, /질문 마감 리마인더 발송.*리마인더 발송 기능이 아직 연결되지 않아 사용할 수 없습니다/);
    expectDisabledActionInViews(desktop, mobile, /지금 발송.*리마인더 발송 기능이 아직 연결되지 않아 사용할 수 없습니다/);
    expect(desktop.getByText("3")).toBeInTheDocument();
  });

  it("does not complete post-session checklist items from aggregate zero counts", () => {
    const { container } = render(<HostDashboard current={current} data={emptyDashboard} />);
    const desktop = getDesktopView(container);
    const publicationRow = desktop.getByText("공개 대기 중인 이전 세션이 없습니다.").closest("li");
    const feedbackRow = desktop.getByText("피드백 문서 등록 대기 중인 이전 세션이 없습니다.").closest("li");

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

    const { container } = render(<HostDashboard current={encodedCurrent} data={dashboard} />);
    const desktop = getDesktopView(container);
    const mobile = getMobileView(container);
    const expectedHref = "/app/host/sessions/session%2F7%3Fdraft%3Dtrue/edit";

    expect(desktop.getByRole("link", { name: "확인" })).toHaveAttribute("href", expectedHref);
    expect(mobile.getByRole("link", { name: "세션 편집" })).toHaveAttribute("href", expectedHref);
    expect(desktop.getByRole("link", { name: "공개 요약 편집" })).toHaveAttribute("href", expectedHref);
    expect(mobile.getByRole("link", { name: "공개 요약 편집" })).toHaveAttribute("href", expectedHref);
  });

  it("normalizes negative check-in metric counts for current sessions", () => {
    const { container } = render(<HostDashboard current={current} data={{ ...dashboard, checkinMissing: -1 }} />);
    const desktop = getDesktopView(container);

    expect(screen.queryByText("-1명 미작성")).not.toBeInTheDocument();
    expect(desktop.getByText("체크인").parentElement).toHaveTextContent("1/2");
  });
});
