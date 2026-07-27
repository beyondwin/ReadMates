import { describe, expect, it } from "vitest";
import {
  completionLabel,
  groupJourneyByYear,
  journeyChips,
  latestJourneyItem,
  type MyJourneyItem,
  type MyJourneySummary,
  shelfEmptyState,
} from "./my-reading-shelf-model";

function journeyItem(overrides: Partial<MyJourneyItem> = {}): MyJourneyItem {
  return {
    sessionId: "session-9",
    sessionNumber: 9,
    bookTitle: "샘플 도서",
    bookAuthor: "샘플 저자",
    bookImageUrl: null,
    date: "2026-07-22",
    readingProgress: 100,
    questionCount: 0,
    reviewCount: 0,
    feedbackDocument: { available: false, readable: false, lockedReason: "NOT_AVAILABLE" },
    ...overrides,
  };
}

const summary: MyJourneySummary = {
  attendedSessionCount: 9,
  completedReadingCount: 7,
  questionCount: 11,
  reviewCount: 4,
  readableFeedbackDocumentCount: 3,
};

describe("my reading shelf model", () => {
  it("keeps the server's first row as the latest journey item", () => {
    const first = journeyItem({ sessionId: "first", sessionNumber: 12 });
    const second = journeyItem({ sessionId: "second", sessionNumber: 11 });

    expect(latestJourneyItem([first, second])).toBe(first);
    expect(latestJourneyItem([])).toBeNull();
  });

  it("groups rows by date year without changing their server order", () => {
    const newest = journeyItem({ sessionId: "newest", date: "2026-07-22" });
    const sameYear = journeyItem({ sessionId: "same-year", date: "2026-01-03" });
    const older = journeyItem({ sessionId: "older", date: "2025-12-30" });

    expect(groupJourneyByYear([newest, sameYear, older])).toEqual([
      { year: "2026", items: [newest, sameYear] },
      { year: "2025", items: [older] },
    ]);
  });

  it("uses a stable unknown-year group for malformed, impossible, or absent dates", () => {
    const malformed = journeyItem({ sessionId: "malformed", date: "not-a-date" });
    const impossibleMonth = journeyItem({ sessionId: "impossible-month", date: "2026-99-99" });
    const impossibleLeapDay = journeyItem({ sessionId: "impossible-leap-day", date: "2026-02-29" });
    const absent = journeyItem({ sessionId: "absent", date: "" });

    expect(groupJourneyByYear([malformed, impossibleMonth, impossibleLeapDay, absent])).toEqual([
      { year: "연도 미상", items: [malformed, impossibleMonth, impossibleLeapDay, absent] },
    ]);
  });

  it("only creates chips for positive question and review counts", () => {
    expect(journeyChips(journeyItem({ questionCount: 2, reviewCount: 1 }))).toEqual([
      { kind: "QUESTION", label: "질문 2" },
      { kind: "REVIEW", label: "서평 1" },
    ]);
    expect(journeyChips(journeyItem({ questionCount: 0, reviewCount: 0 }))).toEqual([]);
  });

  it("formats completion with its attended-session denominator", () => {
    expect(completionLabel(summary)).toBe("완독 7/9");
  });

  it("returns only membership-appropriate empty-state actions", () => {
    expect(
      shelfEmptyState({ membershipStatus: "VIEWER", clubSlug: "sample-club", currentSessionId: "session-now" }),
    ).toMatchObject({ action: { label: "아카이브 둘러보기", href: "/app/archive" } });
    expect(
      shelfEmptyState({ membershipStatus: "ACTIVE", clubSlug: "sample-club", currentSessionId: "session-now" }),
    ).toMatchObject({ action: { label: "이번 세션 보기", href: "/app/session/current" } });
    expect(
      shelfEmptyState({ membershipStatus: "ACTIVE", clubSlug: "sample-club", currentSessionId: null }),
    ).toMatchObject({ action: { label: "아카이브 보기", href: "/app/archive" } });
  });
});
