import type {
  MyPageProfile,
} from "@/features/archive/model/archive-model";
import {
  clubDisplayName,
  formatJoinedMonth,
  membershipIdentityLabel,
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

export type MemberSpaceMetric = {
  label: "함께한 모임" | "완독" | "질문" | "서평";
  value: string;
};

export type MemberSpaceViewModel = {
  avatarLabel: string;
  profileMetaLabel: string;
  joinedMonthLabel: string | null;
  achievementHeading: string;
  achievementBody: "함께 읽는 시간이 차분히 쌓이고 있습니다.";
  metrics: MemberSpaceMetric[];
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

export function buildMemberSpaceViewModel(input: {
  profile: Pick<MyPageProfile, "displayName" | "clubName" | "role" | "membershipStatus" | "joinedAt">;
  summary: MyJourneySummary;
  today: Date;
}): MemberSpaceViewModel {
  const durationLabel = membershipDurationLabel(input.profile.joinedAt, input.today);
  const membershipLabel = membershipIdentityLabel(input.profile).replace(/^정식 /, "");
  const profileMetaParts = [clubDisplayName(input.profile), membershipLabel];
  if (durationLabel) profileMetaParts.push(durationLabel);

  return {
    avatarLabel: input.profile.displayName.trim().charAt(0) || "멤",
    profileMetaLabel: profileMetaParts.join(" · "),
    joinedMonthLabel: durationLabel ? formatJoinedMonth(input.profile.joinedAt) : null,
    achievementHeading: achievementHeading(input.summary),
    achievementBody: "함께 읽는 시간이 차분히 쌓이고 있습니다.",
    metrics: memberSpaceMetrics(input.summary),
  };
}

function countWord(count: number, counter: "번" | "권") {
  const native = count === 1 ? "한" : count === 2 ? "두" : count === 3 ? "세" : String(count);
  return `${native}${count <= 3 ? " " : ""}${counter}`;
}

function achievementHeading(summary: MyJourneySummary) {
  if (summary.attendedSessionCount === 0) {
    return "첫 모임부터 이곳에 독서 기록이 쌓여요.";
  }
  if (summary.completedReadingCount === 0) {
    return `${countWord(summary.attendedSessionCount, "번")}의 모임을 함께했어요.`;
  }
  return `${countWord(summary.attendedSessionCount, "번")}의 모임에서 ${countWord(summary.completedReadingCount, "권")}을 끝까지 읽었어요.`;
}

function memberSpaceMetrics(summary: MyJourneySummary): MemberSpaceMetric[] {
  const metrics: MemberSpaceMetric[] = [
    { label: "함께한 모임", value: String(summary.attendedSessionCount) },
    { label: "완독", value: String(summary.completedReadingCount) },
  ];
  if (summary.questionCount > 0) metrics.push({ label: "질문", value: String(summary.questionCount) });
  if (summary.reviewCount > 0) metrics.push({ label: "서평", value: String(summary.reviewCount) });
  return metrics;
}
