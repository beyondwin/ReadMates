import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  MemberHomeNextActionPace,
  MobileCurrentSessionCard,
} from "@/features/member-home/ui/member-home-current-session";
import type { CurrentSessionReadPageData } from "@/shared/model/current-session-read-view";
import type { ReadingPace } from "@/shared/model/reading-pace";

const urgentPace: ReadingPace = {
  tier: "URGENT",
  daysRemaining: 1,
  label: "서둘러요",
  message: "모임이 곧이라 속도를 올려야 해요.",
};

const session: NonNullable<CurrentSessionReadPageData["currentSession"]> = {
  sessionId: "session-9",
  sessionNumber: 9,
  title: "9회차 모임",
  bookTitle: "돈의 심리학",
  bookAuthor: "모건 하우절",
  bookLink: null,
  bookImageUrl: "https://example.com/books/money.jpg",
  date: "2026-07-15",
  startTime: "20:00",
  endTime: "22:00",
  locationLabel: null,
  meetingUrl: null,
  meetingPasscode: null,
  questionDeadlineAt: "2026-07-14T14:59:00+09:00",
  myRsvpStatus: "NO_RESPONSE",
  myCheckin: null,
  myQuestions: [],
  myOneLineReview: null,
  myLongReview: null,
  board: { questions: [], longReviews: [] },
  attendees: [],
};

describe("MemberHomeNextActionPace", () => {
  it("renders the pace label and message when pace tier is URGENT", () => {
    render(<MemberHomeNextActionPace pace={urgentPace} />);

    expect(screen.getByText("서둘러요")).toBeInTheDocument();
    expect(screen.getByText(/속도를 올려야/)).toHaveClass("small");
  });

  it("renders nothing when pace is null", () => {
    const { container } = render(<MemberHomeNextActionPace pace={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the viewer deadline in a compact flow and uses a chevron session action", () => {
    const { container } = render(
      <MobileCurrentSessionCard
        session={session}
        isHost={false}
        isViewer
        canWrite={false}
        canViewPersonalState={false}
      />,
    );

    expect(container.querySelector(".rm-member-session-card__prep-heading")).toContainElement(
      screen.getByText("준비 현황"),
    );
    expect(screen.getByText(/질문 마감/)).toHaveClass("rm-member-session-card__deadline");

    const sessionLink = screen.getByRole("link", { name: "세션 열기" });
    expect(sessionLink).toHaveAttribute("href", "/app/session/current");
    expect(sessionLink.querySelector("path")).toHaveAttribute("d", "M9 5l7 7-7 7");
  });
});
