export type FeedFilter = "all" | "highlights" | "oneliners" | "questions";

export type NoteFeedKind = "QUESTION" | "ONE_LINE_REVIEW" | "LONG_REVIEW" | "HIGHLIGHT";

export type NoteFeedItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  authorName: string | null;
  authorShortName: string | null;
  kind: NoteFeedKind;
  text: string;
};

export type NoteSessionItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  questionCount: number;
  oneLinerCount: number;
  longReviewCount: number;
  highlightCount: number;
  totalCount: number;
};

export const noteFeedFilters: Array<{ key: FeedFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "highlights", label: "하이라이트" },
  { key: "oneliners", label: "한줄평" },
  { key: "questions", label: "질문" },
];

export function feedFilterFromSearchParam(value: string | null): FeedFilter {
  if (value === "questions" || value === "oneliners" || value === "highlights") {
    return value;
  }

  return "all";
}

export function noteSessionNumberLabel(session: Pick<NoteSessionItem, "sessionNumber">) {
  return `No.${String(session.sessionNumber).padStart(2, "0")}`;
}

export function sessionBookTitle(session: Pick<NoteSessionItem, "sessionNumber" | "bookTitle">) {
  return session.bookTitle || noteSessionNumberLabel(session);
}

export function selectNoteSession(noteSessions: NoteSessionItem[], requestedSessionId: string | null) {
  if (requestedSessionId) {
    const requestedSession = noteSessions.find((session) => session.sessionId === requestedSessionId);

    if (requestedSession) {
      return requestedSession;
    }
  }

  return noteSessions.find((session) => visibleNoteCount(session) > 0) ?? noteSessions[0] ?? null;
}

export function resolveSelectedSession({
  noteSessions,
  selectedSessionId,
  selectedSession,
}: {
  noteSessions: NoteSessionItem[];
  selectedSessionId: string | null;
  selectedSession: NoteSessionItem | null;
}) {
  if (selectedSession) {
    return selectedSession;
  }

  return selectNoteSession(noteSessions, selectedSessionId);
}

export function sessionHref(session: NoteSessionItem, filter: FeedFilter) {
  const params = new URLSearchParams({ sessionId: session.sessionId });

  if (filter !== "all") {
    params.set("filter", filter);
  }

  return `/app/notes?${params.toString()}`;
}

export function sessionRecordSummary(session: NoteSessionItem) {
  return `기록 ${visibleNoteCount(session)}`;
}

export function noteCountOrZero(count: unknown) {
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

export function visibleNoteCount(session: Pick<NoteSessionItem, "questionCount" | "oneLinerCount" | "highlightCount" | "longReviewCount" | "totalCount">) {
  const visibleKindCount =
    noteCountOrZero(session.questionCount) + noteCountOrZero(session.oneLinerCount) + noteCountOrZero(session.highlightCount);

  if (visibleKindCount > 0) {
    return visibleKindCount;
  }

  return Math.max(0, noteCountOrZero(session.totalCount) - noteCountOrZero(session.longReviewCount));
}

export function sessionMatchesQuery(session: NoteSessionItem, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const numberLabel = noteSessionNumberLabel(session).toLocaleLowerCase();
  const compactNumberLabel = numberLabel.replace(".", "");
  const bookTitle = sessionBookTitle(session).toLocaleLowerCase();

  return bookTitle.includes(normalizedQuery) || numberLabel.includes(normalizedQuery) || compactNumberLabel.includes(normalizedQuery);
}

export function uniqueNoteSessions(sessions: NoteSessionItem[]) {
  const seenSessionIds = new Set<string>();

  return sessions.filter((session) => {
    if (seenSessionIds.has(session.sessionId)) {
      return false;
    }

    seenSessionIds.add(session.sessionId);
    return true;
  });
}

export function mobileRecentSessions(noteSessions: NoteSessionItem[], selectedSessionId: string | null) {
  const uniqueSessions = uniqueNoteSessions(noteSessions);
  const recentSessions = uniqueSessions.slice(0, 8);
  const selectedSession = selectedSessionId ? uniqueSessions.find((session) => session.sessionId === selectedSessionId) : undefined;

  if (!selectedSession || recentSessions.some((session) => session.sessionId === selectedSession.sessionId)) {
    return recentSessions;
  }

  return [...uniqueSessions.slice(0, 7), selectedSession];
}

export function itemKey(item: NoteFeedItem) {
  return `${item.sessionId}-${item.kind}-${item.authorName ?? "no-author"}-${item.text}`;
}

export function sessionNumberLabel(item: Pick<NoteFeedItem, "sessionNumber">) {
  return `No.${String(item.sessionNumber).padStart(2, "0")}`;
}

export function noteKindLabel(item: Pick<NoteFeedItem, "kind">) {
  if (item.kind === "QUESTION") {
    return "질문";
  }

  if (item.kind === "ONE_LINE_REVIEW") {
    return "한줄평";
  }

  if (item.kind === "HIGHLIGHT") {
    return "하이라이트";
  }

  if (item.kind === "LONG_REVIEW") {
    return "기록";
  }

  return "기록";
}

export function byKind(items: NoteFeedItem[], kind: NoteFeedKind) {
  return items.filter((item) => item.kind === kind);
}

export function filterKind(filter: FeedFilter): NoteFeedKind | null {
  if (filter === "questions") {
    return "QUESTION";
  }

  if (filter === "oneliners") {
    return "ONE_LINE_REVIEW";
  }

  if (filter === "highlights") {
    return "HIGHLIGHT";
  }

  return null;
}
