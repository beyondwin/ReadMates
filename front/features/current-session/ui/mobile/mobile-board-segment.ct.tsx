import { expect, test } from "@playwright/experimental-ct-react";
import type { CurrentSession } from "@/features/current-session/ui/current-session-types";
import { MobileBoardSegment } from "./mobile-board-segment";

const questionText = "작은 화면에서도 충분한 행간으로 읽혀야 하는 긴 질문입니다.";
const reviewText = "긴 서평 역시 질문과 같은 본문 리듬을 유지해야 합니다.";

const session = {
  sessionId: "session-mobile-board",
  sessionNumber: 8,
  title: "8회차 모임",
  bookTitle: "읽기 좋은 책",
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
  board: {
    questions: [
      {
        priority: 1,
        text: questionText,
        draftThought: null,
        authorName: "질문한 멤버",
        authorShortName: "질",
        avatarKey: "book-tote",
      },
    ],
    longReviews: [
      {
        authorName: "서평 쓴 멤버",
        authorShortName: "서",
        avatarKey: "calendar-book",
        body: reviewText,
      },
    ],
  },
  attendees: [],
} satisfies CurrentSession;

test("MobileBoardSegment keeps question and long-review prose at body rhythm at 320px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const component = await mount(
    <div className="mobile-only">
      <MobileBoardSegment session={session} />
    </div>,
  );

  for (const copy of [component.getByText(questionText), component.getByText(reviewText)]) {
    const typography = await copy.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
      };
    });
    expect(typography.fontSize).toBeGreaterThanOrEqual(16);
    expect(typography.lineHeight / typography.fontSize).toBeGreaterThanOrEqual(1.6);
  }
});
