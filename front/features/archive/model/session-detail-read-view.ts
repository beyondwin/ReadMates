import type {
  ArchiveFeedbackDocumentStatus,
  AttendanceStatus,
  MemberArchiveSessionDetailResponse,
  SessionState,
} from "@/features/archive/model/archive-model";
import { parseSessionState } from "@/features/archive/model/archive-model";
import {
  GUEST_READ_SURFACE_CAPABILITIES,
  type ReadSurfaceCapabilities,
} from "@/shared/model/read-surface-capabilities";

export type SessionDetailHighlight = {
  text: string;
  sortOrder: number;
  authorName: string | null;
  authorShortName: string | null;
  avatarKey: string | null;
};

export type SessionDetailQuestion = {
  priority: number;
  text: string;
  draftThought: string | null;
  authorName: string;
  authorShortName: string;
  avatarKey: string | null;
};

export type SessionDetailOneLiner = {
  authorName: string;
  authorShortName: string;
  avatarKey: string | null;
  text: string;
};

export type SessionDetailLongReview = {
  authorName: string;
  authorShortName: string | null;
  avatarKey: string | null;
  body: string;
};

export type SessionDetailReadView = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  state: SessionState;
  locationLabel: string | null;
  attendance: number;
  total: number;
  myAttendanceStatus: AttendanceStatus | null;
  isHost: boolean;
  publicSummary: string | null;
  publicHighlights: SessionDetailHighlight[];
  clubQuestions: SessionDetailQuestion[];
  clubOneLiners: SessionDetailOneLiner[];
  publicLongReviews: SessionDetailLongReview[];
  myQuestions: SessionDetailQuestion[];
  myCheckin: { readingProgress: number } | null;
  myOneLineReview: { text: string } | null;
  myLongReview: { body: string } | null;
  feedbackDocument: ArchiveFeedbackDocumentStatus | null;
  capabilities: ReadSurfaceCapabilities;
};

export type GuestSessionDetailReadSource = {
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
  summary: string | null;
  highlights: SessionDetailHighlight[];
  questions: SessionDetailQuestion[];
  oneLiners: SessionDetailOneLiner[];
  longReviews: Array<{
    title: string;
    content: string;
    authorName: string;
    authorShortName: string;
    avatarKey: string | null;
  }>;
};

export type MemberSessionDetailReadSource = MemberArchiveSessionDetailResponse & {
  clubLongReviews: SessionDetailLongReview[];
};

export function memberSessionDetailReadView(
  source: MemberSessionDetailReadSource,
  capabilities: ReadSurfaceCapabilities,
): SessionDetailReadView {
  return {
    sessionId: source.sessionId,
    sessionNumber: source.sessionNumber,
    title: source.title,
    bookTitle: source.bookTitle,
    bookAuthor: source.bookAuthor,
    bookImageUrl: source.bookImageUrl,
    date: source.date,
    state: source.state,
    locationLabel: source.locationLabel,
    attendance: source.attendance,
    total: source.total,
    myAttendanceStatus: source.myAttendanceStatus,
    isHost: source.isHost,
    publicSummary: source.publicSummary,
    publicHighlights: source.publicHighlights.map((item) => ({ ...item })),
    clubQuestions: source.clubQuestions.map((item) => ({ ...item })),
    clubOneLiners: source.clubOneLiners.map((item) => ({ ...item })),
    publicLongReviews: source.clubLongReviews.map((item) => ({ ...item })),
    myQuestions: source.myQuestions.map((item) => ({ ...item })),
    myCheckin: source.myCheckin ? { ...source.myCheckin } : null,
    myOneLineReview: source.myOneLineReview ? { ...source.myOneLineReview } : null,
    myLongReview: source.myLongReview ? { ...source.myLongReview } : null,
    feedbackDocument: capabilities.canReadFeedback ? source.feedbackDocument : null,
    capabilities,
  };
}

export function guestSessionDetailReadView(
  source: GuestSessionDetailReadSource,
): SessionDetailReadView | null {
  const state = parseSessionState(source.state);

  if (!state) {
    return null;
  }

  return {
    sessionId: source.sessionId,
    sessionNumber: source.sessionNumber,
    title: source.title,
    bookTitle: source.bookTitle,
    bookAuthor: source.bookAuthor,
    bookImageUrl: source.bookImageUrl,
    date: source.date,
    state,
    locationLabel: null,
    attendance: source.attendance,
    total: source.total,
    myAttendanceStatus: null,
    isHost: false,
    publicSummary: source.summary,
    publicHighlights: source.highlights.map(({ text, sortOrder, authorName, authorShortName, avatarKey }) => ({
      text,
      sortOrder,
      authorName,
      authorShortName,
      avatarKey,
    })),
    clubQuestions: source.questions.map(({ priority, text, draftThought, authorName, authorShortName, avatarKey }) => ({
      priority,
      text,
      draftThought,
      authorName,
      authorShortName,
      avatarKey,
    })),
    clubOneLiners: source.oneLiners.map(({ authorName, authorShortName, avatarKey, text }) => ({
      authorName,
      authorShortName,
      avatarKey,
      text,
    })),
    publicLongReviews: source.longReviews.map(({ authorName, authorShortName, avatarKey, content }) => ({
      authorName,
      authorShortName,
      avatarKey,
      body: content,
    })),
    myQuestions: [],
    myCheckin: null,
    myOneLineReview: null,
    myLongReview: null,
    feedbackDocument: null,
    capabilities: GUEST_READ_SURFACE_CAPABILITIES,
  };
}
