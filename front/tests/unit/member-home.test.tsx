import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MemberHome from "@/features/member-home/components/member-home";
import { memberHomeLoader } from "@/features/member-home/route/member-home-data";
import type {
  MemberHomeAuth as AuthMeResponse,
  MemberHomeCurrentSessionResponse as CurrentSessionResponse,
  MemberHomeNoteFeedItem as NoteFeedItem,
  MemberHomeUpcomingSession,
} from "@/features/member-home/api/member-home-contracts";

afterEach(cleanup);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const auth: AuthMeResponse = {
  authenticated: true,
  userId: "user-1",
  membershipId: "membership-1",
  clubId: "club-1",
  email: "member5@example.com",
  displayName: "수",
  accountName: "이멤버5",
  role: "MEMBER",
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
    meetingUrl: "https://meet.google.com/readmates-member",
    meetingPasscode: "memberpass",
    questionDeadlineAt: "2026-05-19T14:59:00Z",
    myRsvpStatus: "GOING",
    myCheckin: null,
    myQuestions: [],
    myOneLineReview: null,
    myLongReview: null,
    board: {
      questions: [],
      oneLineReviews: [],
      highlights: [],
    },
    attendees: [
      {
        membershipId: "member-1",
        displayName: "수",
        accountName: "이멤버5",
        role: "MEMBER",
        rsvpStatus: "GOING",
        attendanceStatus: "UNKNOWN",
      },
    ],
  },
};

const noteFeedItems: NoteFeedItem[] = [
  {
    sessionId: "session-7",
    sessionNumber: 7,
    bookTitle: "테스트 책",
    date: "2026-05-20",
    authorName: "이멤버5",
    authorShortName: "수",
    kind: "QUESTION",
    text: "내가 직접 넣은 질문만 최근 클럽 흐름에 보여야 합니다.",
  },
  {
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "가난한 찰리의 연감",
    date: "2026-04-15",
    authorName: "김호스트",
    authorShortName: "호스트",
    kind: "ONE_LINE_REVIEW",
    text: "실제 피드의 두 번째 기록입니다.",
  },
];

const upcomingSessions = [
  {
    sessionId: "session-8",
    sessionNumber: 8,
    title: "8회차 · 다음 달 책",
    bookTitle: "다음 달 책",
    bookAuthor: "다음 저자",
    bookImageUrl: null,
    date: "2026-06-17",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    visibility: "MEMBER",
  },
] satisfies MemberHomeUpcomingSession[];

function getDesktopView(container: HTMLElement) {
  const desktop = container.querySelector(".rm-member-home-desktop");
  expect(desktop).not.toBeNull();
  return within(desktop as HTMLElement);
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MemberHome", () => {
  it("loads upcoming sessions for member home", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/bff/api/auth/me") return Promise.resolve(jsonResponse(auth));
      if (url === "/api/bff/api/sessions/current") return Promise.resolve(jsonResponse(current));
      if (url === "/api/bff/api/notes/feed") return Promise.resolve(jsonResponse(noteFeedItems));
      if (url === "/api/bff/api/sessions/upcoming") return Promise.resolve(jsonResponse([]));
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await memberHomeLoader();

    expect(data.upcomingSessions).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/sessions/upcoming", expect.objectContaining({}));
  });

  it("shows member-visible upcoming sessions on desktop and mobile home", () => {
    const { container } = render(
      <MemberHome auth={auth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={upcomingSessions} />,
    );

    const desktop = getDesktopView(container);
    const mobile = within(container.querySelector(".rm-member-home-mobile") as HTMLElement);

    expect(desktop.getByText("다음 달 선정")).toBeInTheDocument();
    expect(desktop.getByText("다음 달 책")).toBeInTheDocument();
    expect(desktop.getByText(/다음 저자/)).toBeInTheDocument();
    expect(mobile.getByText("예정 세션")).toBeInTheDocument();
    expect(mobile.getByText("다음 달 책")).toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: /RSVP.*다음 달 책/ })).not.toBeInTheDocument();
  });

  it("keeps upcoming empty state when there are no upcoming sessions", () => {
    const { container } = render(
      <MemberHome auth={auth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={[]} />,
    );

    const desktop = getDesktopView(container);
    expect(desktop.getByText("아직 등록된 다음 달 후보가 없습니다.")).toBeInTheDocument();
  });

  it("renders the mobile-first member home flow with real action links", () => {
    const { container } = render(
      <MemberHome auth={auth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={[]} />,
    );

    const mobile = container.querySelector(".rm-member-home-mobile");
    expect(mobile).not.toBeNull();

    const mobileElement = mobile as HTMLElement;
    const mobileView = within(mobileElement);
    expect(mobileView.getByText("안녕하세요, 수님.")).toBeInTheDocument();
    expect(mobileView.getByText("이번 세션")).toBeInTheDocument();
    expect(mobileView.getByText("오늘 할 일")).toBeInTheDocument();
    expect(mobileView.getByText("멤버 활동")).toBeInTheDocument();
    expect(mobileView.queryByText("내 통계")).not.toBeInTheDocument();
    expect(mobileView.getByText("바로가기")).toBeInTheDocument();
    expect(mobileView.getByText("3개")).toBeInTheDocument();
    expect(mobileView.queryByText("누적 통계")).not.toBeInTheDocument();
    expect(mobileView.queryByText(/actions/i)).not.toBeInTheDocument();
    expect(mobileView.queryByText("current")).not.toBeInTheDocument();

    expect(mobileView.getByRole("link", { name: /RSVP/ })).toHaveAttribute("href", "/app/session/current");
    expect(mobileView.getByRole("link", { name: /읽기 진행률/ })).toHaveAttribute("href", "/app/session/current");
    expect(mobileView.getByRole("link", { name: /질문 쓰기/ })).toHaveAttribute("href", "/app/session/current");
    expect(mobileView.queryByRole("link", { name: /한줄평/ })).not.toBeInTheDocument();
    expect(mobileView.getByRole("link", { name: /모임 링크 열기/ })).toHaveAttribute(
      "href",
      "https://meet.google.com/readmates-member",
    );
    expect(mobileElement.querySelector(".m-timeline-dot")).not.toBeInTheDocument();
    expect(mobileElement.querySelectorAll(".rm-mobile-shortcuts__icon")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "호스트 화면" })).not.toBeInTheDocument();
    expect(mobileView.getByRole("link", { name: /피드백 문서/ })).toHaveAttribute(
      "href",
      "/app/archive?view=report",
    );
    expect(mobileView.getByRole("link", { name: /안내문/ })).toHaveAttribute("href", "/about");
    expect(mobileView.queryByRole("link", { name: /아카이브/ })).not.toBeInTheDocument();
    expect(mobileView.getByRole("link", { name: /클럽 노트/ })).toHaveAttribute("href", "/app/notes");
  });

  it("renders the mobile session number before the days-until label", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 30));

    const { container } = render(
      <MemberHome auth={auth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={[]} />,
    );
    const metaLine = container.querySelector(".rm-member-home-mobile .rm-member-session-card__meta-line");

    expect(metaLine).not.toBeNull();
    expect(metaLine).toHaveTextContent("No.07 · D-20");
  });

  it("keeps current-session identity to one compact line on member home", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 30));

    const { container } = render(
      <MemberHome auth={auth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={[]} />,
    );
    const desktopMetaLine = container.querySelector(".rm-member-home-desktop .rm-prep-card__meta-line");
    const mobileSectionHeader = container.querySelector(".rm-member-home-mobile .m-eyebrow-row");
    const mobileMetaLine = container.querySelector(".rm-member-home-mobile .rm-member-session-card__meta-line");

    expect(desktopMetaLine).not.toBeNull();
    expect(mobileSectionHeader).not.toBeNull();
    expect(mobileMetaLine).not.toBeNull();
    expect(desktopMetaLine).toHaveTextContent("No.07 · D-20");
    expect(desktopMetaLine).not.toHaveTextContent("이번 세션");
    expect(mobileSectionHeader).toHaveTextContent("이번 세션");
    expect(mobileSectionHeader).not.toHaveTextContent("No.07");
    expect(mobileMetaLine).toHaveTextContent("No.07 · D-20");
    expect(mobileMetaLine?.querySelector(".badge")).not.toBeInTheDocument();
  });

  it("shows viewer members a read-only notice on member home", () => {
    const viewerAuth: AuthMeResponse = {
      ...auth,
      membershipStatus: "VIEWER",
      approvalState: "VIEWER",
    };

    const { container } = render(
      <MemberHome auth={viewerAuth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={[]} />,
    );
    const desktop = getDesktopView(container);
    const mobile = within(container.querySelector(".rm-member-home-mobile") as HTMLElement);

    expect(desktop.getByText("둘러보기 멤버")).toBeInTheDocument();
    expect(desktop.getByText("세션 기록은 읽을 수 있어요. 정식 멤버가 되면 RSVP, 읽기 진행률, 질문 작성 기능이 열립니다.")).toBeInTheDocument();
    expect(mobile.getAllByText("둘러보기 멤버").length).toBeGreaterThan(0);
    expect(mobile.getAllByText("세션 기록은 읽을 수 있어요. 정식 멤버가 되면 RSVP, 읽기 진행률, 질문 작성 기능이 열립니다.").length).toBeGreaterThan(0);
    expect(mobile.getByText("읽기 전용")).toBeInTheDocument();
    expect(mobile.getByRole("link", { name: /세션 읽기/ })).toHaveAttribute("href", "/app/session/current");
    expect(mobile.queryByRole("link", { name: /질문 쓰기/ })).not.toBeInTheDocument();
  });

  it("shows the next gathering prep card", () => {
    const { container } = render(
      <MemberHome auth={auth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={[]} />,
    );
    const desktop = getDesktopView(container);

    expect(desktop.getByText(/No\.07 ·/)).toBeInTheDocument();
    expect(desktop.queryByText(/이번 세션 ·/)).not.toBeInTheDocument();
    expect(desktop.getAllByText("테스트 책").length).toBeGreaterThan(0);
    expect(desktop.getByText("지금 읽는 책")).toBeInTheDocument();
    expect(desktop.getByText("다음 할 일")).toBeInTheDocument();
    expect(desktop.getByText("이미 보존된 기록")).toBeInTheDocument();
    expect(desktop.getByText("내 준비 현황")).toBeInTheDocument();
    expect(desktop.getAllByText("피드백 문서").length).toBeGreaterThan(0);
    expect(desktop.getByRole("link", { name: "세션 열기" })).toHaveAttribute("href", "/app/session/current");
    expect(desktop.getByRole("img", { name: "테스트 책 표지" })).toHaveAttribute(
      "src",
      "https://example.com/covers/test-book.jpg",
    );
    expect(desktop.getByRole("link", { name: /모임 링크 열기/ })).toHaveAttribute(
      "href",
      "https://meet.google.com/readmates-member",
    );
    expect(desktop.getByText("Passcode · memberpass")).toBeInTheDocument();
  });

  it("does not require one-line review before marking home prep as ready", () => {
    const { container } = render(
      <MemberHome
        auth={auth}
        current={{
          currentSession: {
            ...current.currentSession!,
            myCheckin: {
              readingProgress: 80,
            },
            myQuestions: [
              {
                priority: 1,
                text: "첫 번째 질문입니다.",
                draftThought: null,
                authorName: "이멤버5",
                authorShortName: "수",
              },
              {
                priority: 2,
                text: "두 번째 질문입니다.",
                draftThought: null,
                authorName: "이멤버5",
                authorShortName: "수",
              },
            ],
            myOneLineReview: null,
          },
        }}
        noteFeedItems={[]}
        upcomingSessions={[]}
      />,
    );
    const desktop = getDesktopView(container);

    expect(desktop.getByText("준비가 정리되었습니다. 모임 전까지 수정할 수 있어요.")).toBeInTheDocument();
    expect(desktop.queryByText("한줄평을 한 문장으로 남겨 주세요.")).not.toBeInTheDocument();
    expect(desktop.queryByText("한줄평")).not.toBeInTheDocument();
  });

  it("aligns the desktop home header with other member tab headers", () => {
    const { container } = render(
      <MemberHome auth={auth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={[]} />,
    );
    const desktop = container.querySelector(".rm-member-home-desktop");
    const header = desktop?.querySelector("section");

    expect(header).toHaveClass("page-header-compact");
    expect(within(header as HTMLElement).getByText("읽는사이 · 홈")).toBeInTheDocument();
  });

  it("uses the current session RSVP count for next session attendance", () => {
    const { container } = render(
      <MemberHome
        auth={auth}
        current={{
          currentSession: {
            ...current.currentSession!,
            myRsvpStatus: "NO_RESPONSE",
            attendees: [
              {
                membershipId: "member-1",
                displayName: "수",
                accountName: "이멤버5",
                role: "MEMBER",
                rsvpStatus: "GOING",
                attendanceStatus: "UNKNOWN",
              },
              {
                membershipId: "member-2",
                displayName: "호스트",
                accountName: "김호스트",
                role: "HOST",
                rsvpStatus: "GOING",
                attendanceStatus: "UNKNOWN",
              },
              {
                membershipId: "member-3",
                displayName: "멤버4",
                accountName: "송멤버4",
                role: "MEMBER",
                rsvpStatus: "NO_RESPONSE",
                attendanceStatus: "UNKNOWN",
              },
              {
                membershipId: "member-4",
                displayName: "멤버1",
                accountName: "안멤버1",
                role: "MEMBER",
                rsvpStatus: "NO_RESPONSE",
                attendanceStatus: "UNKNOWN",
              },
              {
                membershipId: "member-5",
                displayName: "멤버3",
                accountName: "김멤버3",
                role: "MEMBER",
                rsvpStatus: "NO_RESPONSE",
                attendanceStatus: "UNKNOWN",
              },
              {
                membershipId: "member-6",
                displayName: "멤버2",
                accountName: "최멤버2",
                role: "MEMBER",
                rsvpStatus: "NO_RESPONSE",
                attendanceStatus: "UNKNOWN",
              },
              {
                membershipId: "member-removed",
                displayName: "제외",
                accountName: "제외멤버",
                role: "MEMBER",
                rsvpStatus: "GOING",
                attendanceStatus: "UNKNOWN",
                participationStatus: "REMOVED",
              },
            ],
          },
        }}
        noteFeedItems={noteFeedItems}
        upcomingSessions={[]}
      />,
    );

    const desktop = getDesktopView(container);
    const mobile = within(container.querySelector(".rm-member-home-mobile") as HTMLElement);

    expect(desktop.getByText("참석 2 / 전체 6")).toBeInTheDocument();
    expect(desktop.queryByText("참석 3 / 전체 7")).not.toBeInTheDocument();
    expect(desktop.queryByText("참석 3 / 전체 6")).not.toBeInTheDocument();
    expect(desktop.getByText("현재 RSVP: 미응답")).toBeInTheDocument();
    expect(mobile.getByText("참석 2/6 · 현재 RSVP 미응답")).toBeInTheDocument();
    expect(mobile.queryByText("참석 3/7 · 현재 RSVP 미응답")).not.toBeInTheDocument();
    expect(mobile.queryByText("3/6")).not.toBeInTheDocument();
  });

  it("shows the current member's reading check-in progress in the prep card", () => {
    const { container } = render(
      <MemberHome
        auth={auth}
        current={{
          currentSession: {
            ...current.currentSession!,
            myCheckin: {
              readingProgress: 0,
            },
          },
        }}
        noteFeedItems={noteFeedItems}
        upcomingSessions={[]}
      />,
    );
    const desktop = getDesktopView(container);

    expect(desktop.getByText("0%")).toBeInTheDocument();
    expect(desktop.queryByText("62%")).not.toBeInTheDocument();
  });

  it("shows the home dashboard sections below the prep card", () => {
    const { container } = render(
      <MemberHome auth={auth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={[]} />,
    );
    const desktop = getDesktopView(container);

    expect(desktop.getByText("클럽 흐름")).toBeInTheDocument();
    expect(screen.getAllByText("내가 직접 넣은 질문만 최근 클럽 흐름에 보여야 합니다.").length).toBeGreaterThan(0);
    expect(screen.queryByText("분류는 세계를 이해하기 위한 도구일까요, 아니면 세계를 좁히는 습관일까요?")).not.toBeInTheDocument();
    expect(desktop.queryByText("최근에 남긴 내 기록")).not.toBeInTheDocument();
    expect(desktop.getByText("RSVP · 참석 명단")).toBeInTheDocument();
    expect(desktop.getByText("다음 달 선정")).toBeInTheDocument();
    expect(desktop.getByText("바로가기")).toBeInTheDocument();
    expect(desktop.getByRole("link", { name: /클럽 노트/ })).toHaveAttribute("href", "/app/notes");
    expect(desktop.getByRole("link", { name: /피드백 문서/ })).toHaveAttribute(
      "href",
      "/app/archive?view=report",
    );
    expect(desktop.getByRole("link", { name: /안내문/ })).toHaveAttribute("href", "/about");
    expect(desktop.queryByRole("link", { name: "이번 세션" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "아카이브 →" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "호스트 화면" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: /아카이브 보기/ })).not.toBeInTheDocument();
  });

  it("shows practical empty states when there is no current session", () => {
    const { container } = render(
      <MemberHome auth={auth} current={{ currentSession: null }} noteFeedItems={[]} upcomingSessions={[]} />,
    );
    const desktop = getDesktopView(container);
    const mobile = within(container.querySelector(".rm-member-home-mobile") as HTMLElement);

    expect(desktop.getByText("아직 열린 세션이 없습니다")).toBeInTheDocument();
    expect(desktop.getByText("다음 책이 등록되면 이곳에 책, 일정, 질문 마감, 준비 상태가 한 번에 표시됩니다.")).toBeInTheDocument();
    expect(desktop.getByText("지금 읽는 책")).toBeInTheDocument();
    expect(desktop.getByText("다음 책을 기다리는 중")).toBeInTheDocument();
    expect(desktop.getByText("호스트가 세션을 열면 준비를 시작합니다.")).toBeInTheDocument();
    expect(desktop.getAllByText("아직 표시할 클럽 기록이 없습니다.").length).toBeGreaterThan(0);
    expect(desktop.queryByText("RSVP · 참석 명단")).not.toBeInTheDocument();
    expect(desktop.getByText("참석 현황 준비 중")).toBeInTheDocument();
    expect(desktop.getByText("새 세션이 등록되면 RSVP와 참석 명단이 표시됩니다.")).toBeInTheDocument();
    expect(mobile.getByText("0개")).toBeInTheDocument();
    expect(mobile.queryByText(/actions/i)).not.toBeInTheDocument();
  });

  it("shows the roster empty state when the current session has no attendees", () => {
    render(
      <MemberHome
        auth={auth}
        current={{ currentSession: { ...current.currentSession!, attendees: [] } }}
        noteFeedItems={noteFeedItems}
        upcomingSessions={[]}
      />,
    );

    expect(screen.getByText("참석 현황 준비 중")).toBeInTheDocument();
    expect(screen.queryByText("참석 0명")).not.toBeInTheDocument();
    expect(screen.queryByText("미응답 0")).not.toBeInTheDocument();
    expect(screen.queryByText("현재 세션 참석 데이터가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("새 세션이 등록되면 RSVP와 참석 명단이 표시됩니다.")).not.toBeInTheDocument();
    expect(screen.getByText("참석 명단이 준비되면 RSVP 현황이 표시됩니다.")).toBeInTheDocument();
  });

  it("links host members to create a session when there is no current session", () => {
    const { container } = render(
      <MemberHome
        auth={{ ...auth, role: "HOST" }}
        current={{ currentSession: null }}
        noteFeedItems={[]}
        upcomingSessions={[]}
      />,
    );
    const desktop = getDesktopView(container);

    expect(desktop.getByRole("link", { name: "새 세션 만들기" })).toHaveAttribute("href", "/app/host/sessions/new");
  });

  it("visually marks members who RSVP as attending in the roster summary", () => {
    render(
      <MemberHome
        auth={auth}
        current={{
          currentSession: {
            ...current.currentSession!,
            attendees: [
              current.currentSession!.attendees[0],
              {
                membershipId: "member-2",
                displayName: "멤버3",
                accountName: "김멤버3",
                role: "MEMBER",
                rsvpStatus: "NO_RESPONSE",
                attendanceStatus: "UNKNOWN",
              },
            ],
          },
        }}
        noteFeedItems={noteFeedItems}
        upcomingSessions={[]}
      />,
    );

    const attendingChip = screen.getByLabelText("수 · 참석");
    const pendingChip = screen.getByLabelText("멤버3 · 미응답");

    expect(attendingChip).toHaveAttribute("data-rsvp-status", "GOING");
    expect(attendingChip).toHaveTextContent("수");
    expect(pendingChip).toHaveTextContent("멤");
  });

  it("uses the shared MAYBE RSVP label in roster labels", () => {
    render(
      <MemberHome
        auth={auth}
        current={{
          currentSession: {
            ...current.currentSession!,
            attendees: [
              {
                membershipId: "member-maybe",
                displayName: "미",
                accountName: "박미정",
                role: "MEMBER",
                rsvpStatus: "MAYBE",
                attendanceStatus: "UNKNOWN",
              },
            ],
          },
        }}
        noteFeedItems={noteFeedItems}
        upcomingSessions={[]}
      />,
    );

    expect(screen.getByLabelText("미 · 미정")).toHaveAttribute("data-rsvp-status", "MAYBE");
  });

  it("does not repeat the host workspace switch inside member home content", () => {
    render(
      <MemberHome auth={{ ...auth, role: "HOST" }} current={current} noteFeedItems={noteFeedItems} upcomingSessions={[]} />,
    );

    expect(screen.queryByRole("link", { name: "호스트 화면" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "세션 운영으로" })).toHaveAttribute(
      "href",
      "/app/host/sessions/session-7/edit",
    );
  });
});
