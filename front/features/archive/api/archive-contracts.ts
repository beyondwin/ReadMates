export type MemberRole = "HOST" | "MEMBER";
export type MembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type AttendanceStatus = "UNKNOWN" | "ATTENDED" | "ABSENT";
export type SessionState = "DRAFT" | "OPEN" | "PUBLISHED" | "CLOSED";
export type CurrentSessionPolicy = "APPLY_NOW" | "NEXT_SESSION";
export type MemberProfileErrorCode =
  | "SHORT_NAME_DUPLICATE"
  | "SHORT_NAME_REQUIRED"
  | "SHORT_NAME_TOO_LONG"
  | "SHORT_NAME_INVALID"
  | "SHORT_NAME_RESERVED"
  | "MEMBERSHIP_NOT_ALLOWED";

export type UpdateMemberProfileRequest = {
  shortName: string;
};

export type MemberProfileResponse = {
  membershipId: string;
  displayName: string;
  shortName: string;
  profileImageUrl: string | null;
};

export type ArchiveSessionItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  attendance: number;
  total: number;
  published: boolean;
  state: SessionState;
  feedbackDocument?: MemberArchiveFeedbackDocumentStatus;
};

export type MemberArchiveHighlightItem = {
  text: string;
  sortOrder: number;
  authorName: string | null;
  authorShortName: string | null;
};

export type MemberArchiveQuestionItem = {
  priority: number;
  text: string;
  draftThought: string | null;
  authorName: string;
  authorShortName: string;
};

export type MemberArchiveCheckinItem = {
  readingProgress: number;
};

export type MemberArchiveOneLinerItem = {
  authorName: string;
  authorShortName: string;
  text: string;
};

export type MemberArchiveOneLineReview = {
  text: string;
};

export type MemberArchiveLongReview = {
  body: string;
};

export type MemberArchiveFeedbackDocumentStatus = {
  available: boolean;
  readable: boolean;
  lockedReason: "NOT_AVAILABLE" | "NOT_ATTENDED" | null;
  title: string | null;
  uploadedAt: string | null;
};

export type MemberArchiveSessionDetailResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  state: SessionState;
  locationLabel: string;
  attendance: number;
  total: number;
  myAttendanceStatus: AttendanceStatus | null;
  isHost: boolean;
  publicSummary: string | null;
  publicHighlights: MemberArchiveHighlightItem[];
  clubQuestions: MemberArchiveQuestionItem[];
  clubOneLiners: MemberArchiveOneLinerItem[];
  publicOneLiners: MemberArchiveOneLinerItem[];
  myQuestions: MemberArchiveQuestionItem[];
  myCheckin: MemberArchiveCheckinItem | null;
  myOneLineReview: MemberArchiveOneLineReview | null;
  myLongReview: MemberArchiveLongReview | null;
  feedbackDocument: MemberArchiveFeedbackDocumentStatus;
};

export type MyArchiveQuestionItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  priority: number;
  text: string;
  draftThought: string | null;
};

export type MyArchiveReviewItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  kind: "LONG_REVIEW";
  text: string;
};

export type FeedbackDocumentListItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor?: string | null;
  bookImageUrl?: string | null;
  date: string;
  fileName: string;
  uploadedAt: string;
};

export type NoteFeedItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  authorName: string | null;
  authorShortName: string | null;
  kind: "QUESTION" | "ONE_LINE_REVIEW" | "LONG_REVIEW" | "HIGHLIGHT";
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

export type MyPageResponse = {
  displayName: string;
  shortName: string;
  email: string;
  role: MemberRole;
  membershipStatus: MembershipStatus;
  clubName: string | null;
  joinedAt: string;
  sessionCount: number;
  totalSessionCount: number;
  recentAttendances: Array<{
    sessionNumber: number;
    attended: boolean;
  }>;
};
