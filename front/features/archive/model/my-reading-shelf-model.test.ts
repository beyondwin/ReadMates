import { describe, expect, it } from "vitest";
import type { MyPageProfile, MyRecentAttendance } from "./archive-model";
import {
  appendUniqueJourneyItems,
  buildParticipationJourneyViewModel,
  completionLabel,
  emptyMyJourneyPage,
  groupJourneyByYear,
  membershipDurationLabel,
  participationTimelineItem,
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

const participationSummary: MyJourneySummary = {
  attendedSessionCount: 9,
  completedReadingCount: 7,
  questionCount: 28,
  reviewCount: 3,
  readableFeedbackDocumentCount: 3,
};

const recentAttendances: MyRecentAttendance[] = [
  { sessionNumber: 4, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
  { sessionNumber: 5, attended: true, attendanceStatus: "ATTENDED", readingProgress: 80 },
  { sessionNumber: 6, attended: false, attendanceStatus: "ABSENT", readingProgress: 0 },
  { sessionNumber: 7, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
  { sessionNumber: 8, attended: true, attendanceStatus: "ATTENDED", readingProgress: 70 },
  { sessionNumber: 9, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
];

function participationProfile(
  overrides: Partial<Pick<MyPageProfile, "joinedAt" | "membershipStatus" | "currentSessionId" | "recentAttendances">> = {},
): Pick<MyPageProfile, "joinedAt" | "membershipStatus" | "currentSessionId" | "recentAttendances"> {
  return {
    joinedAt: "2024-11",
    membershipStatus: "ACTIVE",
    currentSessionId: "session-current",
    recentAttendances,
    ...overrides,
  };
}

function participationViewModel(input: {
  profile?: Partial<Pick<MyPageProfile, "joinedAt" | "membershipStatus" | "currentSessionId" | "recentAttendances">>;
  summary?: MyJourneySummary;
} = {}) {
  return buildParticipationJourneyViewModel({
    profile: participationProfile(input.profile),
    summary: input.summary ?? participationSummary,
    today: new Date(2026, 6, 15),
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

  it("formats completion with its attended-session denominator", () => {
    expect(completionLabel(summary)).toBe("완독 7/9");
  });

  it("returns only membership-appropriate empty-state actions", () => {
    expect(
      shelfEmptyState({ membershipStatus: "VIEWER", currentSessionId: "session-now" }),
    ).toMatchObject({ action: { label: "아카이브 둘러보기", href: "/app/archive" } });
    expect(
      shelfEmptyState({ membershipStatus: "ACTIVE", currentSessionId: "session-now" }),
    ).toMatchObject({ action: { label: "이번 세션 보기", href: "/app/session/current" } });
    expect(
      shelfEmptyState({ membershipStatus: "ACTIVE", currentSessionId: null }),
    ).toMatchObject({ action: { label: "아카이브 보기", href: "/app/archive" } });
  });

  it("formats membership duration and rejects invalid or future months", () => {
    const today = new Date(2026, 6, 15);

    expect(membershipDurationLabel("2026-07", today)).toBe("이번 달부터 함께");
    expect(membershipDurationLabel("2025-11", today)).toBe("함께한 지 8개월");
    expect(membershipDurationLabel("2024-11", today)).toBe("함께한 지 1년 8개월");
    expect(membershipDurationLabel("not-a-month", today)).toBeNull();
    expect(membershipDurationLabel("2026-08", today)).toBeNull();
  });

  it("maps attendance and reading progress without treating absence as progress", () => {
    expect(participationTimelineItem({
      sessionNumber: 7,
      attended: true,
      attendanceStatus: "ATTENDED",
      readingProgress: 100,
    })).toMatchObject({ statusLabel: "참여", readingLabel: "완독" });

    expect(participationTimelineItem({
      sessionNumber: 8,
      attended: false,
      attendanceStatus: "ABSENT",
      readingProgress: 40,
    })).toMatchObject({ statusLabel: "불참", readingLabel: null });

    expect(participationTimelineItem({
      sessionNumber: 9,
      attended: false,
      attendanceStatus: "UNKNOWN",
      readingProgress: 80,
    })).toMatchObject({ statusLabel: "미확인", readingLabel: null });
  });

  it.each([
    [0, null],
    [40, "40%"],
    [100, "완독"],
  ])("maps attended reading progress %i to %s", (readingProgress, readingLabel) => {
    expect(participationTimelineItem({
      sessionNumber: 7,
      attended: true,
      attendanceStatus: "ATTENDED",
      readingProgress,
    }).readingLabel).toBe(readingLabel);
  });

  it("builds the participation summary, streak, nudge, and supporting stats from their distinct sources", () => {
    const viewModel = participationViewModel();

    expect(viewModel.achievementLabel).toBe("함께한 모임 9회");
    expect(viewModel.membershipDurationLabel).toBe("함께한 지 1년 8개월");
    expect(viewModel.recentSummaryLabel).toBe("최근 6회 중 5회 함께했어요");
    expect(viewModel.streakLabel).toBe("현재 3회 연속 참여");
    expect(viewModel.nudge).toEqual({
      body: "다음 모임에도 함께하면 4회 연속 참여가 됩니다.",
      label: "이번 세션 보기",
      href: "/app/session/current",
    });
    expect(viewModel.supportingStats).toEqual([
      { label: "완독", value: "7 / 9" },
      { label: "질문", value: "28" },
      { label: "서평", value: "3" },
    ]);
  });

  it.each([1, 2, 3, 4, 5])("retains exactly the provided %i recent attendance rows", (count) => {
    expect(participationViewModel({
      profile: { recentAttendances: recentAttendances.slice(0, count) },
    }).timelineItems).toHaveLength(count);
  });

  it("excludes an unconfirmed newest row from the denominator and streak", () => {
    const rows = recentAttendances.map((row, index) => index === 5
      ? { ...row, attended: false, attendanceStatus: "UNKNOWN" as const }
      : row);
    const viewModel = participationViewModel({ profile: { recentAttendances: rows } });

    expect(viewModel.recentSummaryLabel).toBe("최근 확인된 5회 중 4회 함께했어요");
    expect(viewModel.streakLabel).toBeNull();
  });

  it("waits for attendance confirmation when every recent row is unknown", () => {
    const rows: MyRecentAttendance[] = [
      { sessionNumber: 8, attended: false, attendanceStatus: "UNKNOWN", readingProgress: 0 },
      { sessionNumber: 9, attended: false, attendanceStatus: "UNKNOWN", readingProgress: 0 },
    ];

    expect(participationViewModel({ profile: { recentAttendances: rows } }).recentSummaryLabel)
      .toBe("출석 확인을 기다리고 있어요");
  });

  it("withholds the streak after a newest absence or a single attendance", () => {
    expect(participationViewModel({
      profile: { recentAttendances: [...recentAttendances.slice(0, 5), {
        ...recentAttendances[5], attended: false, attendanceStatus: "ABSENT",
      }] },
    }).streakLabel).toBeNull();

    expect(participationViewModel({
      profile: { recentAttendances: [recentAttendances[0]] },
    }).streakLabel).toBeNull();
  });

  it("stops the backward streak scan at an unknown row", () => {
    const rows: MyRecentAttendance[] = [
      { sessionNumber: 6, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
      { sessionNumber: 7, attended: false, attendanceStatus: "UNKNOWN", readingProgress: 0 },
      { sessionNumber: 8, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
      { sessionNumber: 9, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
    ];

    expect(participationViewModel({ profile: { recentAttendances: rows } }).streakLabel)
      .toBe("현재 2회 연속 참여");
  });

  it("hides participation history when neither the summary nor rows record attendance", () => {
    const zeroSummary: MyJourneySummary = {
      attendedSessionCount: 0,
      completedReadingCount: 0,
      questionCount: 0,
      reviewCount: 0,
      readableFeedbackDocumentCount: 0,
    };

    expect(participationViewModel({
      profile: { recentAttendances: [] },
      summary: zeroSummary,
    }).hasParticipationHistory).toBe(false);
  });

  it("keeps nonzero supporting stats even without participation history", () => {
    const noParticipationSummary: MyJourneySummary = {
      attendedSessionCount: 0,
      completedReadingCount: 0,
      questionCount: 2,
      reviewCount: 1,
      readableFeedbackDocumentCount: 0,
    };

    expect(participationViewModel({
      profile: { recentAttendances: [] },
      summary: noParticipationSummary,
    }).supportingStats).toEqual([
      { label: "질문", value: "2" },
      { label: "서평", value: "1" },
    ]);
  });

  it.each([
    "INVITED",
    "VIEWER",
    "SUSPENDED",
    "LEFT",
    "INACTIVE",
  ] as const)("does not offer a nudge to %s memberships", (membershipStatus) => {
    expect(participationViewModel({ profile: { membershipStatus } }).nudge).toBeNull();
  });

  it("does not offer a nudge without a current session", () => {
    expect(participationViewModel({ profile: { currentSessionId: null } }).nudge).toBeNull();
  });

  it("offers a fresh-flow nudge to active members without a streak", () => {
    expect(participationViewModel({
      profile: { recentAttendances: [recentAttendances[2]] },
    }).nudge).toEqual({
      body: "다음 모임부터 새로운 참여 흐름을 이어가 보세요.",
      label: "이번 세션 보기",
      href: "/app/session/current",
    });
  });

  it("uses only mid-join rows in the recent participation denominator", () => {
    expect(participationViewModel({
      profile: { recentAttendances: [recentAttendances[0], recentAttendances[1]] },
    }).recentSummaryLabel).toBe("최근 2회 중 2회 함께했어요");
  });

  it("uses only the newest six eligible rows while preserving chronological order", () => {
    const sevenEligibleRows: MyRecentAttendance[] = [
      { sessionNumber: 3, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
      ...recentAttendances,
    ];
    const viewModel = participationViewModel({
      profile: { recentAttendances: sevenEligibleRows },
    });

    expect(viewModel.timelineItems.map((item) => item.sessionNumber)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(viewModel.timelineItems).toHaveLength(6);
    expect(viewModel.recentSummaryLabel).toBe("최근 6회 중 5회 함께했어요");
    expect(viewModel.streakLabel).toBe("현재 3회 연속 참여");
    expect(viewModel.nudge).toMatchObject({
      body: "다음 모임에도 함께하면 4회 연속 참여가 됩니다.",
    });
  });
});
