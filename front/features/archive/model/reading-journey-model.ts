export type JourneyQuestionItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  text: string;
};

export type JourneyReviewItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  text: string;
};

export function readingCompletionRate({
  completedReadingCount,
  totalSessionCount,
}: {
  completedReadingCount: number;
  totalSessionCount: number;
}): number {
  return totalSessionCount > 0 ? Math.round((completedReadingCount / totalSessionCount) * 100) : 0;
}

export type BookHistoryGroup = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  questionCount: number;
  reviewCount: number;
};

export function groupHistoryByBook(
  questions: JourneyQuestionItem[],
  reviews: JourneyReviewItem[],
): BookHistoryGroup[] {
  const map = new Map<string, BookHistoryGroup>();
  const ensure = (sessionId: string, sessionNumber: number, bookTitle: string, date: string) => {
    const existing = map.get(sessionId);
    if (existing) {
      return existing;
    }
    const created: BookHistoryGroup = { sessionId, sessionNumber, bookTitle, date, questionCount: 0, reviewCount: 0 };
    map.set(sessionId, created);
    return created;
  };
  for (const question of questions) {
    if (!question) {
      continue;
    }
    ensure(question.sessionId, question.sessionNumber, question.bookTitle, question.date).questionCount += 1;
  }
  for (const review of reviews) {
    if (!review) {
      continue;
    }
    ensure(review.sessionId, review.sessionNumber, review.bookTitle, review.date).reviewCount += 1;
  }
  return [...map.values()].sort((a, b) => b.sessionNumber - a.sessionNumber);
}

export type TimelineItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  kind: "QUESTION" | "REVIEW";
  text: string;
};

export function mergeActivityTimeline(
  questions: JourneyQuestionItem[],
  reviews: JourneyReviewItem[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...questions
      .filter((question): question is JourneyQuestionItem => Boolean(question))
      .map((question) => ({
        sessionId: question.sessionId,
        sessionNumber: question.sessionNumber,
        bookTitle: question.bookTitle,
        date: question.date,
        kind: "QUESTION" as const,
        text: question.text,
      })),
    ...reviews
      .filter((review): review is JourneyReviewItem => Boolean(review))
      .map((review) => ({
        sessionId: review.sessionId,
        sessionNumber: review.sessionNumber,
        bookTitle: review.bookTitle,
        date: review.date,
        kind: "REVIEW" as const,
        text: review.text,
      })),
  ];
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.sessionNumber - a.sessionNumber));
}
