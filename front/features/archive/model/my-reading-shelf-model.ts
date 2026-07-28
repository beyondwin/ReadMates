import type { MembershipStatus } from "@/features/archive/model/archive-model";

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

export type JourneyChip = {
  kind: "QUESTION" | "REVIEW";
  label: string;
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

export function latestJourneyItem(items: MyJourneyItem[]): MyJourneyItem | null {
  return items[0] ?? null;
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

export function journeyChips(item: MyJourneyItem): JourneyChip[] {
  const chips: JourneyChip[] = [];
  if (item.questionCount > 0) chips.push({ kind: "QUESTION", label: `질문 ${item.questionCount}` });
  if (item.reviewCount > 0) chips.push({ kind: "REVIEW", label: `서평 ${item.reviewCount}` });
  return chips;
}

export function completionLabel(summary: MyJourneySummary): string {
  return `완독 ${summary.completedReadingCount}/${summary.attendedSessionCount}`;
}

export function shelfEmptyState(input: {
  membershipStatus: MembershipStatus;
  clubSlug: string;
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
