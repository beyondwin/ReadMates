import type {
  MyPageProfile,
  MyRecentAttendance,
  MyRecentAttendanceStatus,
  MembershipStatus,
} from "@/features/archive/model/archive-model";

export type MyJourneyFeedbackDocument = {
  available: boolean;
  readable: boolean;
  lockedReason: "NOT_AVAILABLE" | "ACTIVE_MEMBERSHIP_REQUIRED" | null;
};

export type MyJourneyItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  readingProgress: number | null;
  questionCount: number;
  reviewCount: number;
  feedbackDocument: MyJourneyFeedbackDocument;
};

export type MyJourneySummary = {
  attendedSessionCount: number;
  completedReadingCount: number;
  questionCount: number;
  reviewCount: number;
  readableFeedbackDocumentCount: number;
};

export type MyJourneyPage = {
  items: MyJourneyItem[];
  summary: MyJourneySummary;
  nextCursor: string | null;
};

export type JourneyYearGroup = {
  year: string;
  items: MyJourneyItem[];
};

export type ShelfEmptyState = {
  title: string;
  body: string;
  action: { label: string; href: string } | null;
};

export type ParticipationTimelineItem = {
  sessionNumber: number;
  attendanceStatus: MyRecentAttendanceStatus;
  statusLabel: "참여" | "불참" | "미확인";
  readingLabel: string | null;
};

export type ParticipationJourneyViewModel = {
  hasParticipationHistory: boolean;
  achievementLabel: string;
  membershipDurationLabel: string | null;
  recentSummaryLabel: string | null;
  streakLabel: string | null;
  timelineItems: ParticipationTimelineItem[];
  nudge: {
    body: string;
    label: "이번 세션 보기";
    href: "/app/session/current";
  } | null;
  supportingStats: Array<{
    label: "완독" | "질문" | "서평";
    value: string;
  }>;
};

const UNKNOWN_YEAR = "연도 미상";

export function emptyMyJourneyPage(): MyJourneyPage {
  return {
    items: [],
    nextCursor: null,
    summary: {
      attendedSessionCount: 0,
      completedReadingCount: 0,
      questionCount: 0,
      reviewCount: 0,
      readableFeedbackDocumentCount: 0,
    },
  };
}

export function appendUniqueJourneyItems(
  current: MyJourneyItem[],
  incoming: MyJourneyItem[],
): MyJourneyItem[] {
  const seen = new Set(current.map((item) => item.sessionId));
  return [
    ...current,
    ...incoming.filter((item) => {
      if (seen.has(item.sessionId)) return false;
      seen.add(item.sessionId);
      return true;
    }),
  ];
}

export function groupJourneyByYear(items: MyJourneyItem[]): JourneyYearGroup[] {
  const groups = new Map<string, MyJourneyItem[]>();

  for (const item of items) {
    const year = validDateYear(item.date) ?? UNKNOWN_YEAR;
    const group = groups.get(year);

    if (group) {
      group.push(item);
    } else {
      groups.set(year, [item]);
    }
  }

  return Array.from(groups, ([year, groupedItems]) => ({ year, items: groupedItems }));
}

function validDateYear(date: string): string | null {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? yearText
    : null;
}

export function completionLabel(summary: MyJourneySummary): string {
  return `완독 ${summary.completedReadingCount}/${summary.attendedSessionCount}`;
}

export function membershipDurationLabel(joinedAt: string, today: Date): string | null {
  const match = joinedAt.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;

  const monthDifference = (today.getFullYear() - year) * 12 + today.getMonth() - (month - 1);
  if (monthDifference < 0) return null;
  if (monthDifference === 0) return "이번 달부터 함께";

  const years = Math.floor(monthDifference / 12);
  const months = monthDifference % 12;
  if (years === 0) return `함께한 지 ${months}개월`;
  if (months === 0) return `함께한 지 ${years}년`;
  return `함께한 지 ${years}년 ${months}개월`;
}

export function participationTimelineItem(row: MyRecentAttendance): ParticipationTimelineItem {
  const statusLabel = row.attendanceStatus === "ATTENDED"
    ? "참여"
    : row.attendanceStatus === "ABSENT"
      ? "불참"
      : "미확인";
  const readingLabel = row.attendanceStatus !== "ATTENDED" || row.readingProgress <= 0
    ? null
    : row.readingProgress >= 100
      ? "완독"
      : `${row.readingProgress}%`;

  return {
    sessionNumber: row.sessionNumber,
    attendanceStatus: row.attendanceStatus,
    statusLabel,
    readingLabel,
  };
}

export function buildParticipationJourneyViewModel(input: {
  profile: Pick<
    MyPageProfile,
    "joinedAt" | "membershipStatus" | "currentSessionId" | "recentAttendances"
  >;
  summary: MyJourneySummary;
  today: Date;
}): ParticipationJourneyViewModel {
  const rows = input.profile.recentAttendances;
  const confirmed = rows.filter((row) => row.attendanceStatus !== "UNKNOWN");
  const recentAttended = confirmed.filter((row) => row.attendanceStatus === "ATTENDED").length;
  const hasUnknown = rows.some((row) => row.attendanceStatus === "UNKNOWN");
  const recentSummaryLabel = rows.length === 0
    ? null
    : confirmed.length === 0
      ? "출석 확인을 기다리고 있어요"
      : hasUnknown
        ? `최근 확인된 ${confirmed.length}회 중 ${recentAttended}회 함께했어요`
        : `최근 ${confirmed.length}회 중 ${recentAttended}회 함께했어요`;
  const currentStreak = rows.toReversed().findIndex((row) => row.attendanceStatus !== "ATTENDED");
  const streakCount = currentStreak === -1 ? rows.length : currentStreak;
  const streakLabel = streakCount >= 2 ? `현재 ${streakCount}회 연속 참여` : null;
  const hasParticipationHistory = input.summary.attendedSessionCount > 0 || rows.length > 0;
  const allSupportingStats = [
    {
      label: "완독" as const,
      value: `${input.summary.completedReadingCount} / ${input.summary.attendedSessionCount}`,
      count: input.summary.attendedSessionCount,
    },
    { label: "질문" as const, value: String(input.summary.questionCount), count: input.summary.questionCount },
    { label: "서평" as const, value: String(input.summary.reviewCount), count: input.summary.reviewCount },
  ];
  const supportingStats = hasParticipationHistory
    ? allSupportingStats.map(({ label, value }) => ({ label, value }))
    : allSupportingStats
      .filter(({ count }) => count > 0)
      .map(({ label, value }) => ({ label, value }));
  const nudge = input.profile.membershipStatus === "ACTIVE" && input.profile.currentSessionId
    ? {
      body: streakCount >= 2
        ? `다음 모임에도 함께하면 ${streakCount + 1}회 연속 참여가 됩니다.`
        : "다음 모임부터 새로운 참여 흐름을 이어가 보세요.",
      label: "이번 세션 보기" as const,
      href: "/app/session/current" as const,
    }
    : null;

  return {
    hasParticipationHistory,
    achievementLabel: `함께한 모임 ${input.summary.attendedSessionCount}회`,
    membershipDurationLabel: membershipDurationLabel(input.profile.joinedAt, input.today),
    recentSummaryLabel,
    streakLabel,
    timelineItems: rows.map(participationTimelineItem),
    nudge,
    supportingStats,
  };
}

export function shelfEmptyState(input: {
  membershipStatus: MembershipStatus;
  currentSessionId: string | null;
}): ShelfEmptyState {
  if (input.membershipStatus === "VIEWER") {
    return {
      title: "아직 쌓인 개인 기록이 없습니다",
      body: "둘러보기 멤버는 공개된 아카이브 기록을 읽을 수 있습니다.",
      action: { label: "아카이브 둘러보기", href: "/app/archive" },
    };
  }

  if (input.currentSessionId) {
    return {
      title: "아직 쌓인 개인 기록이 없습니다",
      body: "이번 모임의 기록이 쌓이면 이곳에서 책별로 다시 읽을 수 있습니다.",
      action: { label: "이번 세션 보기", href: "/app/session/current" },
    };
  }

  return {
    title: "아직 쌓인 개인 기록이 없습니다",
    body: "참여한 회차의 기록이 생기면 이곳에 책별로 모입니다.",
    action: { label: "아카이브 보기", href: "/app/archive" },
  };
}
