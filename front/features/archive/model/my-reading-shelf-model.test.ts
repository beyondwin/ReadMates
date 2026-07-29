import { describe, expect, it } from "vitest";
import type { MyPageProfile } from "./archive-model";
import {
  appendUniqueJourneyItems,
  buildMemberSpaceViewModel,
  emptyMyJourneyPage,
  groupJourneyByYear,
  membershipDurationLabel,
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

  it("formats membership duration and rejects invalid or future months", () => {
    const today = new Date(2026, 6, 15);

    expect(membershipDurationLabel("2026-07", today)).toBe("이번 달부터 함께");
    expect(membershipDurationLabel("2025-11", today)).toBe("함께한 지 8개월");
    expect(membershipDurationLabel("2024-11", today)).toBe("함께한 지 1년 8개월");
    expect(membershipDurationLabel("not-a-month", today)).toBeNull();
    expect(membershipDurationLabel("2026-08", today)).toBeNull();
  });

  it("builds a cumulative member-space profile and achievement summary", () => {
    expect(memberSpaceViewModel()).toEqual({
      avatarLabel: "멤",
      profileMetaLabel: "읽는사이 · 멤버 · 함께한 지 8개월",
      joinedMonthLabel: "2025.11",
      achievementHeading: "세 번의 모임에서 세 권을 끝까지 읽었어요.",
      achievementBody: "함께 읽는 시간이 차분히 쌓이고 있습니다.",
      metrics: [
        { label: "함께한 모임", value: "3" },
        { label: "완독", value: "3" },
        { label: "질문", value: "12" },
      ],
    });
  });

  it.each([
    [0, 0, "첫 모임부터 이곳에 독서 기록이 쌓여요."],
    [3, 0, "세 번의 모임을 함께했어요."],
    [9, 7, "9번의 모임에서 7권을 끝까지 읽었어요."],
  ])("uses the cumulative narrative for %i sessions and %i completed books", (attended, completed, heading) => {
    expect(memberSpaceViewModel({ summary: {
      attendedSessionCount: attended,
      completedReadingCount: completed,
      questionCount: 0,
      reviewCount: 0,
      readableFeedbackDocumentCount: 0,
    } }).achievementHeading).toBe(heading);
  });

  it("keeps the required metrics first when optional metrics are empty", () => {
    expect(memberSpaceViewModel({ summary: {
      attendedSessionCount: 0,
      completedReadingCount: 0,
      questionCount: 0,
      reviewCount: 0,
      readableFeedbackDocumentCount: 0,
    } }).metrics.map(({ label }) => label)).toEqual(["함께한 모임", "완독"]);
  });

  it("appends positive question and review metrics in semantic order", () => {
    expect(memberSpaceViewModel({ summary: {
      attendedSessionCount: 3,
      completedReadingCount: 2,
      questionCount: 12,
      reviewCount: 4,
      readableFeedbackDocumentCount: 0,
    } }).metrics).toEqual([
      { label: "함께한 모임", value: "3" },
      { label: "완독", value: "2" },
      { label: "질문", value: "12" },
      { label: "서평", value: "4" },
    ]);
  });

  it("omits an invalid or future joined-month label while retaining valid profile details", () => {
    expect(memberSpaceViewModel({ profile: { joinedAt: "2026-08" } }).joinedMonthLabel).toBeNull();
    expect(memberSpaceViewModel({ profile: { joinedAt: "not-a-month" } }).profileMetaLabel)
      .not.toContain("함께한 지");
  });

  it("uses the membership fallback initial when the display name is blank", () => {
    expect(memberSpaceViewModel({ profile: { displayName: "   " } }).avatarLabel).toBe("멤");
  });
});
