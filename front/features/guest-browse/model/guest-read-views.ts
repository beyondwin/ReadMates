import type { NoteFeedItem, NoteSessionItem } from "@/shared/model/notes-feed-model";
import type { PagedResponse } from "@/shared/model/paging";

export type GuestCapabilities = { canWrite: false };
export type GuestNoteKind = "QUESTION" | "ONE_LINE_REVIEW" | "LONG_REVIEW" | "HIGHLIGHT";
export type GuestNoteFilter = "all" | "highlights" | "oneliners" | "questions";

export function guestNoteKind(value: string): GuestNoteKind | null {
  if (value === "QUESTION" || value === "ONE_LINE_REVIEW" || value === "LONG_REVIEW" || value === "HIGHLIGHT") return value;
  return null;
}

export function guestNoteKindLabel(kind: GuestNoteKind) {
  if (kind === "QUESTION") return "질문";
  if (kind === "ONE_LINE_REVIEW") return "한줄평";
  if (kind === "LONG_REVIEW") return "서평";
  return "하이라이트";
}

export function guestNoteMatchesFilter(kind: GuestNoteKind, filter: GuestNoteFilter) {
  if (filter === "all") return true;
  if (filter === "highlights") return kind === "HIGHLIGHT";
  if (filter === "oneliners") return kind === "ONE_LINE_REVIEW";
  return kind === "QUESTION";
}

export type GuestRsvpLabel = "참석" | "미정" | "불참" | "응답 전";
export type GuestAttendanceLabel = "참석 확인" | "불참 확인" | "미확인";

export function guestRsvpLabel(status: string): GuestRsvpLabel {
  if (status === "GOING") return "참석";
  if (status === "MAYBE") return "미정";
  if (status === "DECLINED") return "불참";
  return "응답 전";
}

export function guestAttendanceLabel(status: string): GuestAttendanceLabel {
  if (status === "ATTENDED") return "참석 확인";
  if (status === "ABSENT") return "불참 확인";
  return "미확인";
}

export type GuestPage<T> = { items: T[]; nextCursor: string | null };

export type GuestQuestionReadView = {
  priority: number;
  text: string;
  draftThought: string | null;
  authorName: string;
  authorShortName: string;
  avatarKey: string;
};

export type GuestLongReviewReadView = {
  title: string;
  content: string;
  authorName: string;
  authorShortName: string;
  avatarKey: string;
};

export type GuestSessionReadView = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  questionDeadlineAt: string;
  attendees: Array<{ displayName: string; avatarKey: string; rsvpStatus: string; attendanceStatus: string }>;
  board: { questions: GuestQuestionReadView[]; longReviews: GuestLongReviewReadView[] };
  capabilities: GuestCapabilities;
};

export type GuestUpcomingSessionReadView = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  questionDeadlineAt: string;
  state: string;
};

export type GuestNoteSessionReadView = {
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

export type GuestNoteFeedItemReadView = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  authorName: string | null;
  authorShortName: string | null;
  avatarKey: string | null;
  kind: GuestNoteKind;
  text: string;
};

export type GuestArchiveSessionReadView = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  attendance: number;
  total: number;
  state: string;
};

export type GuestArchiveDetailReadView = GuestArchiveSessionReadView & {
  summary: string | null;
  highlights: Array<{ text: string; sortOrder: number; authorName: string | null; authorShortName: string | null; avatarKey: string | null }>;
  questions: GuestQuestionReadView[];
  oneLiners: Array<{ text: string; authorName: string; authorShortName: string; avatarKey: string }>;
  longReviews: GuestLongReviewReadView[];
};

export type GuestHomeReadView = {
  current: { currentSession: GuestSessionReadView | null };
  upcoming: GuestPage<GuestUpcomingSessionReadView>;
  recentNotes: GuestPage<GuestNoteFeedItemReadView>;
  widgetErrors?: Partial<Record<"current" | "upcoming" | "recentNotes", { status?: number; retryAfterSeconds?: number }>>;
  capabilities: GuestCapabilities;
};

export type GuestNotesReadView = {
  sessions: GuestPage<GuestNoteSessionReadView>;
  feed: GuestPage<GuestNoteFeedItemReadView>;
  capabilities: GuestCapabilities;
};
type GuestNoteFeedInput = Omit<GuestNoteFeedItemReadView, "kind"> & { kind: string };

type GuestCurrentSessionInput = { currentSession: (Omit<GuestSessionReadView, "capabilities" | "board"> & { board: { questions: GuestQuestionReadView[]; longReviews: GuestLongReviewReadView[] } }) | null };

export function guestSessionReadView(response: GuestCurrentSessionInput): { currentSession: GuestSessionReadView | null } {
  const session = response.currentSession;
  if (!session) return { currentSession: null };
  return {
    currentSession: {
      sessionId: session.sessionId,
      sessionNumber: session.sessionNumber,
      title: session.title,
      bookTitle: session.bookTitle,
      bookAuthor: session.bookAuthor,
      bookImageUrl: session.bookImageUrl,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      questionDeadlineAt: session.questionDeadlineAt,
      attendees: session.attendees.map(({ displayName, avatarKey, rsvpStatus, attendanceStatus }) => ({ displayName, avatarKey, rsvpStatus, attendanceStatus })),
      board: {
        questions: session.board.questions.map(({ priority, text, draftThought, authorName, authorShortName, avatarKey }) => ({ priority, text, draftThought, authorName, authorShortName, avatarKey })),
        longReviews: session.board.longReviews.map(({ title, content, authorName, authorShortName, avatarKey }) => ({ title, content, authorName, authorShortName, avatarKey })),
      },
      capabilities: { canWrite: false },
    },
  };
}

export function guestHomeReadView(
  current: GuestCurrentSessionInput,
  upcoming: GuestPage<GuestUpcomingSessionReadView>,
  recentNotes: GuestPage<GuestNoteFeedInput>,
  widgetErrors?: GuestHomeReadView["widgetErrors"],
): GuestHomeReadView {
  return {
    current: guestSessionReadView(current),
    upcoming: guestUpcomingPageReadView(upcoming),
    recentNotes: guestNoteFeedPageReadView(recentNotes),
    capabilities: { canWrite: false },
    ...(widgetErrors && Object.keys(widgetErrors).length ? { widgetErrors } : {}),
  };
}

export function guestUpcomingPageReadView(upcoming: GuestPage<GuestUpcomingSessionReadView>): GuestPage<GuestUpcomingSessionReadView> {
  return { items: upcoming.items.map((session) => ({ sessionId: session.sessionId, sessionNumber: session.sessionNumber, title: session.title, bookTitle: session.bookTitle, bookAuthor: session.bookAuthor, bookImageUrl: session.bookImageUrl, date: session.date, startTime: session.startTime, endTime: session.endTime, questionDeadlineAt: session.questionDeadlineAt, state: session.state })), nextCursor: upcoming.nextCursor };
}

export function guestNotesReadView(
  sessions: GuestPage<GuestNoteSessionReadView>,
  feed: GuestPage<GuestNoteFeedInput>,
): GuestNotesReadView {
  return {
    sessions: guestNoteSessionsPageReadView(sessions),
    feed: guestNoteFeedPageReadView(feed),
    capabilities: { canWrite: false },
  };
}

export function guestNoteSessionsPageReadView(sessions: GuestPage<GuestNoteSessionReadView>): GuestPage<GuestNoteSessionReadView> {
  return guestNoteSessionsReadPage(sessions);
}

export function guestNoteFeedPageReadView(feed: GuestPage<GuestNoteFeedInput>): GuestPage<GuestNoteFeedItemReadView> {
  return guestNoteFeedReadPage(feed);
}

export function guestNoteSessionsReadPage(sessions: GuestPage<GuestNoteSessionReadView>): PagedResponse<NoteSessionItem> {
  return {
    items: sessions.items.map((session) => ({
      sessionId: session.sessionId,
      sessionNumber: session.sessionNumber,
      bookTitle: session.bookTitle,
      date: session.date,
      questionCount: session.questionCount,
      oneLinerCount: session.oneLinerCount,
      longReviewCount: session.longReviewCount,
      highlightCount: session.highlightCount,
      totalCount: session.totalCount,
    })),
    nextCursor: sessions.nextCursor,
  };
}

export function guestNoteFeedReadPage(feed: GuestPage<GuestNoteFeedInput>): PagedResponse<NoteFeedItem> {
  return {
    items: feed.items.flatMap((item): NoteFeedItem[] => {
    const kind = guestNoteKind(item.kind);
    if (!kind) {
      return [];
    }

    return [{
      sessionId: item.sessionId,
      sessionNumber: item.sessionNumber,
      bookTitle: item.bookTitle,
      date: item.date,
      authorName: item.authorName,
      authorShortName: item.authorShortName,
      avatarKey: item.avatarKey,
      kind,
      text: item.text,
    }];
  }),
    nextCursor: feed.nextCursor,
  };
}

export function guestArchivePageReadView(page: GuestPage<GuestArchiveSessionReadView>): GuestPage<GuestArchiveSessionReadView> {
  return { items: page.items.map((session) => ({ sessionId: session.sessionId, sessionNumber: session.sessionNumber, title: session.title, bookTitle: session.bookTitle, bookAuthor: session.bookAuthor, bookImageUrl: session.bookImageUrl, date: session.date, attendance: session.attendance, total: session.total, state: session.state })), nextCursor: page.nextCursor };
}

export function guestArchiveDetailReadView(detail: GuestArchiveDetailReadView): GuestArchiveDetailReadView & { capabilities: GuestCapabilities } {
  return {
    sessionId: detail.sessionId, sessionNumber: detail.sessionNumber, title: detail.title, bookTitle: detail.bookTitle, bookAuthor: detail.bookAuthor, bookImageUrl: detail.bookImageUrl, date: detail.date, attendance: detail.attendance, total: detail.total, state: detail.state, summary: detail.summary,
    highlights: detail.highlights.map((item) => ({ text: item.text, sortOrder: item.sortOrder, authorName: item.authorName, authorShortName: item.authorShortName, avatarKey: item.avatarKey })),
    questions: detail.questions.map((item) => ({ priority: item.priority, text: item.text, draftThought: item.draftThought, authorName: item.authorName, authorShortName: item.authorShortName, avatarKey: item.avatarKey })),
    oneLiners: detail.oneLiners.map((item) => ({ text: item.text, authorName: item.authorName, authorShortName: item.authorShortName, avatarKey: item.avatarKey })),
    longReviews: detail.longReviews.map((item) => ({ title: item.title, content: item.content, authorName: item.authorName, authorShortName: item.authorShortName, avatarKey: item.avatarKey })),
    capabilities: { canWrite: false },
  };
}
