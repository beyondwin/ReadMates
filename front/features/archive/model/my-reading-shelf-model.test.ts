import { describe, expect, it } from "vitest";
import type { MyPageProfile } from "./archive-model";
import {
  appendUniqueJourneyItems,
  buildMemberSpaceViewModel,
  buildRecentReadingPreview,
  emptyMyJourneyPage,
  groupJourneyByYear,
  type MyJourneyItem,
  type MyJourneySummary,
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

function memberProfile(
  overrides: Partial<Pick<MyPageProfile, "displayName" | "clubName" | "role" | "membershipStatus" | "joinedAt">> = {},
): Pick<MyPageProfile, "displayName" | "clubName" | "role" | "membershipStatus" | "joinedAt"> {
  return {
    displayName: "멤버1",
    clubName: "읽는사이",
    role: "MEMBER",
    membershipStatus: "ACTIVE",
    joinedAt: "2025-11",
    ...overrides,
  };
}

function memberSpaceViewModel(input: {
  profile?: Partial<Pick<MyPageProfile, "displayName" | "clubName" | "role" | "membershipStatus" | "joinedAt">>;
  summary?: MyJourneySummary;
} = {}) {
  return buildMemberSpaceViewModel({
    profile: memberProfile(input.profile),
    summary: input.summary ?? {
      attendedSessionCount: 3,
      completedReadingCount: 3,
      questionCount: 12,
      reviewCount: 0,
      readableFeedbackDocumentCount: 2,
    },
    today: new Date(2026, 6, 29),
  });
}

describe("my reading shelf model", () => {
  it("creates a stable empty journey page", () => {
    expect(emptyMyJourneyPage()).toEqual({
      items: [],
      nextCursor: null,
      summary: {
        attendedSessionCount: 0,
        completedReadingCount: 0,
        questionCount: 0,
        reviewCount: 0,
        readableFeedbackDocumentCount: 0,
      },
    });
  });

  it("appends only unseen session rows while preserving order", () => {
    const first = journeyItem({ sessionId: "first" });
    const second = journeyItem({ sessionId: "second" });
    const third = journeyItem({ sessionId: "third" });

    expect(appendUniqueJourneyItems([first, second], [second, third])).toEqual([
      first,
      second,
      third,
    ]);
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

  it("builds a cumulative member-space profile and achievement summary", () => {
    expect(memberSpaceViewModel()).toEqual({
      profileMetaLabel: "읽는사이 · 멤버 · 2025.11부터 함께",
      achievementHeading: "읽고, 묻고, 기록해 온 시간",
      journeyStats: [
        { kind: "sessions", label: "참여한 모임", value: "3", unit: "회" },
        { kind: "completed", label: "완독한 책", value: "3", unit: "권" },
      ],
      recordTraces: [
        {
          kind: "questions",
          label: "대화를 연 질문",
          description: "책에서 시작된 생각의 기록",
          value: "12",
          unit: "개",
        },
        {
          kind: "reviews",
          label: "남긴 서평",
          description: "아직 남긴 서평이 없어요",
          value: "0",
          unit: "편",
        },
      ],
    });
  });

  it("keeps all journey stats and record traces visible when counts are zero", () => {
    expect(memberSpaceViewModel({ summary: {
      attendedSessionCount: 0,
      completedReadingCount: 0,
      questionCount: 0,
      reviewCount: 0,
      readableFeedbackDocumentCount: 0,
    } })).toMatchObject({
      achievementHeading: "읽고, 묻고, 기록해 온 시간",
      journeyStats: [
        { kind: "sessions", label: "참여한 모임", value: "0", unit: "회" },
        { kind: "completed", label: "완독한 책", value: "0", unit: "권" },
      ],
      recordTraces: [
        { kind: "questions", value: "0", unit: "개" },
        { kind: "reviews", description: "아직 남긴 서평이 없어요", value: "0", unit: "편" },
      ],
    });
  });

  it("uses an exact valid joined month once and omits invalid or future months", () => {
    expect(memberSpaceViewModel({ profile: { joinedAt: "2025-11" } }).profileMetaLabel)
      .toBe("읽는사이 · 멤버 · 2025.11부터 함께");
    expect(memberSpaceViewModel({ profile: { joinedAt: "not-a-month" } }).profileMetaLabel)
      .toBe("읽는사이 · 멤버");
    expect(memberSpaceViewModel({ profile: { joinedAt: "2026-08" } }).profileMetaLabel)
      .toBe("읽는사이 · 멤버");
  });

  it("maps at most three recent readings in server order", () => {
    const fourth = journeyItem({ sessionId: "fourth", bookTitle: "네 번째 책" });
    expect(buildRecentReadingPreview([
      journeyItem({
        sessionId: "first",
        sessionNumber: 12,
        bookTitle: "  첫 번째 책  ",
        bookAuthor: "  첫 저자  ",
        bookImageUrl: "https://example.com/public-safe-cover.jpg",
        date: "2026-07-20",
        questionCount: 2,
        reviewCount: 1,
        feedbackDocument: { available: true, readable: true, lockedReason: null },
      }),
      journeyItem({
        sessionId: "second",
        bookTitle: "두 번째 책",
        feedbackDocument: {
          available: true,
          readable: false,
          lockedReason: "ACTIVE_MEMBERSHIP_REQUIRED",
        },
      }),
      journeyItem({ sessionId: "third", bookTitle: "세 번째 책" }),
      fourth,
    ])).toEqual([
      {
        sessionId: "first",
        sessionNumberLabel: "No.12",
        dateLabel: "2026.07.20",
        bookTitle: "첫 번째 책",
        bookAuthor: "첫 저자",
        bookImageUrl: "https://example.com/public-safe-cover.jpg",
        coverFallbackLabel: "첫",
        activityLabels: ["질문 2", "서평 1"],
        feedbackStatus: "피드백 O",
      },
      expect.objectContaining({
        sessionId: "second",
        feedbackStatus: "피드백 제한",
      }),
      expect.objectContaining({
        sessionId: "third",
        feedbackStatus: "피드백 준비중",
      }),
    ]);
  });

  it("formats a single-digit recent session with the archive number identity", () => {
    expect(buildRecentReadingPreview([
      journeyItem({ sessionNumber: 7 }),
    ])[0]?.sessionNumberLabel).toBe("No.07");
  });

  it("uses safe title, author, cover, date, and empty-activity fallbacks", () => {
    expect(buildRecentReadingPreview([
      journeyItem({
        bookTitle: "   ",
        bookAuthor: "   ",
        bookImageUrl: null,
        date: "2026-02-29",
        questionCount: 0,
        reviewCount: 0,
        feedbackDocument: {
          available: false,
          readable: false,
          lockedReason: "NOT_AVAILABLE",
        },
      }),
    ])).toEqual([
      expect.objectContaining({
        bookTitle: "제목 없는 책",
        bookAuthor: null,
        coverFallbackLabel: "책",
        dateLabel: "날짜 미상",
        activityLabels: [],
        feedbackStatus: "피드백 준비중",
      }),
    ]);
  });
});
