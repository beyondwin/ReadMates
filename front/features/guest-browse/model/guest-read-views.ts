export type GuestCapabilities = { canWrite: false };

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
  kind: string;
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
};

export type GuestNotesReadView = {
  sessions: GuestPage<GuestNoteSessionReadView>;
  feed: GuestPage<GuestNoteFeedItemReadView>;
};

type GuestCurrentSessionInput = { currentSession: Omit<GuestSessionReadView, "capabilities" | "board"> & { board: { questions: GuestQuestionReadView[]; longReviews: GuestLongReviewReadView[] } } };

export function guestSessionReadView(response: GuestCurrentSessionInput): { currentSession: GuestSessionReadView } {
  const session = response.currentSession;
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
  recentNotes: GuestPage<GuestNoteFeedItemReadView>,
): GuestHomeReadView {
  return { current: guestSessionReadView(current), upcoming, recentNotes };
}

export function guestNotesReadView(
  sessions: GuestPage<GuestNoteSessionReadView>,
  feed: GuestPage<GuestNoteFeedItemReadView>,
): GuestNotesReadView {
  return { sessions, feed };
}

export function guestArchiveReadView(page: GuestPage<GuestArchiveSessionReadView>): GuestPage<GuestArchiveSessionReadView> {
  return page;
}

export function guestArchiveDetailReadView(detail: GuestArchiveDetailReadView): GuestArchiveDetailReadView {
  return detail;
}
