import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MemberHomeRecentRecordEntry } from "@/features/member-home/model/member-home-view-model";
import {
  ClubPulse,
  MobileMemberActivity,
  MobileRecentRecordEntry,
  RecentRecordEntry,
  RosterSummary,
} from "@/features/member-home/ui/member-home-records";

const entry: MemberHomeRecentRecordEntry = {
  sessionId: "session-8",
  sessionNumber: 8,
  bookTitle: "긴 제목의 다음 책",
  date: "2026-06-18",
  kindLabels: ["질문", "하이라이트"],
  href: "/app/sessions/session-8",
  feedbackHref: "/app/feedback/session-8",
  feedbackState: "UNKNOWN",
  feedbackStatusLabel: "피드백 문서는 열람 화면에서 확인합니다.",
  returnStateLabel: "지난 모임 회고",
  summary: "긴 제목의 다음 책의 기록과 피드백을 이어 읽을 수 있어요.",
};

const authoredQuestion = {
  sessionId: "session-8",
  sessionNumber: 8,
  date: "2026-06-18",
  kind: "QUESTION" as const,
  text: "같이 이야기하고 싶은 질문입니다.",
  authorName: "질문한 멤버",
  authorShortName: "질문",
  avatarKey: "cloud-green-book",
  bookTitle: "긴 제목의 다음 책",
  createdAt: "2026-06-18T12:00:00Z",
};

const authoredLongReview = {
  sessionId: "session-9",
  sessionNumber: 9,
  date: "2026-07-22",
  kind: "LONG_REVIEW" as const,
  text: "돈의 심리를 읽고 남긴 긴 서평입니다.",
  authorName: "서평 멤버",
  authorShortName: "서평",
  avatarKey: "cloud-green-book",
  bookTitle: "돈의 심리학",
  createdAt: "2026-07-22T12:00:00Z",
};

describe("member home record reflection cards", () => {
  it("marks the desktop club pulse as a separate home section", () => {
    const { container } = render(<ClubPulse items={[authoredQuestion]} />);

    expect(container.firstElementChild).toHaveClass("rm-club-pulse");
  });

  it("renders a long review with the localized kind label on desktop and mobile", () => {
    const desktop = render(<ClubPulse items={[authoredLongReview]} />);

    expect(screen.getByText("No.09 · 서평")).toBeVisible();
    expect(desktop.container).not.toHaveTextContent("LONG_REVIEW");
    desktop.unmount();

    const mobile = render(<MobileMemberActivity items={[authoredLongReview]} />);

    expect(screen.getByText("No.09")).toBeVisible();
    expect(screen.getByText("서평")).toBeVisible();
    expect(mobile.container).not.toHaveTextContent("LONG_REVIEW");
  });

  it("uses the author role for desktop and mobile activity avatars", () => {
    const pulse = render(<ClubPulse items={[authoredQuestion]} />);
    expect(
      pulse.container.querySelector(".rm-club-pulse-entry__author .rm-avatar-chip"),
    ).toHaveAttribute("data-avatar-size-role", "author");
    pulse.unmount();

    const mobile = render(<MobileMemberActivity items={[authoredQuestion]} />);
    expect(
      mobile.container.querySelector(".rm-member-activity-card__author .rm-avatar-chip"),
    ).toHaveAttribute("data-avatar-size-role", "author");
  });

  it("scopes the reading face to desktop and mobile reflection content", () => {
    const reflection = {
      sessionId: "session-8",
      sessionNumber: 8,
      date: "2026-06-18",
      kind: "HIGHLIGHT" as const,
      text: "같은 문장을 서로 다른 경험으로 읽은 기록입니다.",
      authorName: null,
      authorShortName: null,
      avatarKey: "cloud-green-book",
      bookTitle: "긴 제목의 다음 책",
      createdAt: "2026-06-18T12:00:00Z",
    };

    const { unmount } = render(<ClubPulse items={[reflection]} />);
    expect(screen.getByText(reflection.text)).toHaveClass("body-lg", "editorial");
    expect(screen.getByText(reflection.text)).not.toHaveClass("reading-editorial");
    unmount();

    render(<MobileMemberActivity items={[reflection]} />);
    expect(screen.getByText(reflection.text)).toHaveClass("body", "editorial");
    expect(screen.getByText(reflection.text)).not.toHaveClass("reading-editorial");
  });

  it("uses the projected safe avatar key for a mobile null-author highlight", () => {
    const reflection = {
      sessionId: "session-8",
      sessionNumber: 8,
      date: "2026-06-18",
      kind: "HIGHLIGHT" as const,
      text: "이름 없이 보존된 하이라이트입니다.",
      authorName: null,
      authorShortName: null,
      avatarKey: "cloud-green-book",
      bookTitle: "긴 제목의 다음 책",
    };

    const { container } = render(<MobileMemberActivity items={[reflection]} />);

    expect(container.querySelector(".rm-member-activity-card__author .rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/cloud-green-book.webp",
    );
    expect(container.querySelector(".rm-member-activity-card__author .rm-avatar-chip")).toHaveClass("rm-avatar-chip--artwork");
    expect(screen.getByText("회차 하이라이트")).toBeVisible();
  });

  it("renders the desktop reflection card with record and feedback actions", () => {
    const { container } = render(<RecentRecordEntry entry={entry} />);

    const region = screen.getByRole("region", { name: "지난 모임 회고" });
    const documents = within(region).getByRole("navigation", { name: "지난 모임 문서" });
    expect(region).toBeInTheDocument();
    expect(screen.getByText("지난 모임 회고")).toBeInTheDocument();
    expect(screen.getByText("No.08 · 긴 제목의 다음 책")).toBeInTheDocument();
    expect(screen.getByText("긴 제목의 다음 책의 기록과 피드백을 이어 읽을 수 있어요.")).toHaveClass("body");
    expect(screen.getByText("긴 제목의 다음 책의 기록과 피드백을 이어 읽을 수 있어요.")).not.toHaveClass(
      "reading-editorial",
    );
    expect(screen.getByText("보존된 내용 · 질문 · 하이라이트")).toBeInTheDocument();
    expect(screen.getByText("피드백 문서는 열람 화면에서 확인합니다.")).toBeInTheDocument();
    expect(within(documents).getByRole("link", { name: /모임 기록 보기/ })).toHaveAttribute(
      "href",
      "/app/sessions/session-8",
    );
    expect(within(documents).getByRole("link", { name: /피드백 문서 보기/ })).toHaveAttribute(
      "href",
      "/app/feedback/session-8",
    );
    expect(container).not.toHaveTextContent("→");
    expect(container.querySelectorAll(".rm-recent-record__destination-chevron")).toHaveLength(2);
    expect(container.querySelectorAll(".rm-recent-record__destination-chevron")[0]).toHaveTextContent("›");
  });

  it("renders locked feedback state without a feedback action", () => {
    render(
      <RecentRecordEntry
        entry={{
          ...entry,
          feedbackState: "LOCKED",
          feedbackStatusLabel: "참석 멤버에게만 피드백 문서가 열립니다.",
        }}
      />,
    );

    expect(screen.getByText("피드백 문서 보기")).toBeInTheDocument();
    expect(screen.getByText("참석 멤버에게만 피드백 문서가 열립니다.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /피드백 문서 보기/ })).not.toBeInTheDocument();
  });

  it("renders missing feedback state without a feedback action", () => {
    render(
      <RecentRecordEntry
        entry={{
          ...entry,
          feedbackState: "MISSING",
          feedbackStatusLabel: "아직 열람 가능한 피드백 문서가 없습니다.",
        }}
      />,
    );

    expect(screen.getByText("피드백 문서 보기")).toBeInTheDocument();
    expect(screen.getByText("아직 열람 가능한 피드백 문서가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /피드백 문서 보기/ })).not.toBeInTheDocument();
  });

  it("renders the mobile reflection card with the same core labels", () => {
    render(<MobileRecentRecordEntry entry={entry} />);

    const region = screen.getByRole("region", { name: "지난 모임 회고" });
    const documents = within(region).getByRole("navigation", { name: "지난 모임 문서" });

    expect(screen.getByText("지난 모임 회고")).toBeInTheDocument();
    expect(screen.getByText("No.08 · 긴 제목의 다음 책")).toBeInTheDocument();
    expect(screen.getByText("긴 제목의 다음 책의 기록과 피드백을 이어 읽을 수 있어요.")).toHaveClass("body");
    expect(screen.getByText("긴 제목의 다음 책의 기록과 피드백을 이어 읽을 수 있어요.")).not.toHaveClass(
      "reading-editorial",
    );
    expect(screen.getByText("보존된 내용 · 질문 · 하이라이트")).toBeInTheDocument();
    expect(within(documents).getByRole("link", { name: /모임 기록 보기/ })).toHaveAttribute(
      "href",
      "/app/sessions/session-8",
    );
    expect(within(documents).getByRole("link", { name: /피드백 문서 보기/ })).toHaveAttribute(
      "href",
      "/app/feedback/session-8",
    );
    expect(within(documents).getByText("피드백 문서 보기").parentElement).toHaveClass(
      "rm-recent-record__destination-copy--start",
    );
  });

  it("renders nothing when no reflection entry exists", () => {
    const { container: desktop } = render(<RecentRecordEntry entry={null} />);
    const { container: mobile } = render(<MobileRecentRecordEntry entry={null} />);

    expect(desktop).toBeEmptyDOMElement();
    expect(mobile).toBeEmptyDOMElement();
  });

  it("keeps unanswered RSVP prose sans while retaining numeric count semantics", () => {
    const { container } = render(
      <RosterSummary
        current={{
          currentSession: {
            sessionId: "session-8",
            sessionNumber: 8,
            title: "8회차 모임",
            bookTitle: "긴 제목의 다음 책",
            bookAuthor: "저자",
            bookLink: null,
            bookImageUrl: null,
            date: "2026-06-18",
            startTime: "19:00",
            endTime: "21:00",
            locationLabel: "모임 공간",
            meetingUrl: null,
            meetingPasscode: null,
            questionDeadlineAt: "2026-06-17T12:00:00Z",
            myRsvpStatus: "GOING",
            myCheckin: null,
            myQuestions: [],
            myOneLineReview: null,
            myLongReview: null,
            board: { questions: [], longReviews: [] },
            attendees: [
              {
                membershipId: "membership-1",
                avatarKey: "cloud-green-book",
                displayName: "응답 전 멤버",
                accountName: "member@example.com",
                role: "MEMBER",
                rsvpStatus: "NO_RESPONSE",
                attendanceStatus: "UNKNOWN",
              },
            ],
          },
        }}
      />,
    );
    const noResponse = screen.getByText(/미응답/, { selector: ".small" });

    expect(noResponse).not.toHaveClass("mono");
    expect(noResponse.querySelector(".ledger-number")).toHaveTextContent("1");
    expect(container.querySelector(".rm-avatar-chip")).toHaveAttribute("data-avatar-size-role", "roster");
  });

  it("renders nine RSVP members as an ordered semantic roster", () => {
    const attendees = Array.from({ length: 9 }, (_, index) => ({
      renderKey: `membership-${index + 1}`,
      avatarKey: index % 2 === 0 ? "cloud-green-book" : "banana-green-book",
      displayName: `참석자 ${index + 1}`,
      role: "MEMBER" as const,
      rsvpStatus: index < 6 ? "GOING" as const : "NO_RESPONSE" as const,
      attendanceStatus: "UNKNOWN" as const,
      participationStatus: "ACTIVE" as const,
    }));
    const { container } = render(
      <RosterSummary
        current={{
          currentSession: {
            sessionId: "session-9",
            sessionNumber: 9,
            title: "9회차 모임",
            bookTitle: "공개 테스트 도서",
            bookAuthor: "저자",
            bookLink: null,
            bookImageUrl: null,
            date: "2026-08-09",
            startTime: "19:00",
            endTime: "21:00",
            locationLabel: "모임 공간",
            meetingUrl: null,
            meetingPasscode: null,
            questionDeadlineAt: "2026-08-08T12:00:00Z",
            myRsvpStatus: "GOING",
            myCheckin: null,
            myQuestions: [],
            myOneLineReview: null,
            myLongReview: null,
            board: { questions: [], longReviews: [] },
            attendees,
            capabilities: {
              canWrite: true,
              canReadFeedback: true,
              canViewPersonalState: true,
            },
          },
        }}
      />,
    );

    const roster = container.querySelector(".rm-member-home-roster");
    expect(roster).toBeInTheDocument();
    expect(roster).toHaveAttribute("role", "list");
    expect(roster).toHaveAttribute("aria-label", "RSVP 참석자");
    expect(roster?.querySelectorAll(".rm-member-home-roster__item")).toHaveLength(9);
    expect(
      Array.from(
        roster!.querySelectorAll(".rm-avatar-chip"),
        (node) => node.getAttribute("title"),
      ),
    ).toEqual([
      "참석자 1 · 참석",
      "참석자 2 · 참석",
      "참석자 3 · 참석",
      "참석자 4 · 참석",
      "참석자 5 · 참석",
      "참석자 6 · 참석",
      "참석자 7 · 미응답",
      "참석자 8 · 미응답",
      "참석자 9 · 미응답",
    ]);
  });
});
