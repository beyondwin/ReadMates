export type MemberRole = "HOST" | "MEMBER";
export type MembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type ApprovalState = "ANONYMOUS" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "INACTIVE";
export type SessionParticipationStatus = "ACTIVE" | "REMOVED";
export type CurrentSessionPolicy = "APPLY_NOW" | "NEXT_SESSION";
export type CurrentSessionPolicyResult = "APPLIED" | "NOT_APPLICABLE" | "DEFERRED";
export type RsvpStatus = "NO_RESPONSE" | "GOING" | "MAYBE" | "DECLINED";
export type AttendanceStatus = "UNKNOWN" | "ATTENDED" | "ABSENT";
export type SessionState = "DRAFT" | "OPEN" | "PUBLISHED" | "CLOSED";

export type AuthMeResponse = {
  authenticated: boolean;
  userId: string | null;
  membershipId: string | null;
  clubId: string | null;
  email: string | null;
  displayName: string | null;
  shortName: string | null;
  role: MemberRole | null;
  membershipStatus: MembershipStatus | null;
  approvalState: ApprovalState;
};

export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export type HostInvitationListItem = {
  invitationId: string;
  email: string;
  name: string;
  role: MemberRole;
  status: InvitationStatus;
  effectiveStatus: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  applyToCurrentSession: boolean;
  canRevoke: boolean;
  canReissue: boolean;
};

export type HostInvitationResponse = HostInvitationListItem & {
  acceptUrl: string | null;
};

export type ViewerMember = {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  shortName: string;
  profileImageUrl: string | null;
  status: MembershipStatus;
  createdAt: string;
};

export type HostMemberListItem = {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  shortName: string;
  profileImageUrl: string | null;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: string | null;
  createdAt: string;
  currentSessionParticipationStatus: SessionParticipationStatus | null;
  canSuspend: boolean;
  canRestore: boolean;
  canDeactivate: boolean;
  canAddToCurrentSession: boolean;
  canRemoveFromCurrentSession: boolean;
};

export type MemberLifecycleRequest = {
  currentSessionPolicy: CurrentSessionPolicy;
};

export type MemberLifecycleResponse = {
  member: HostMemberListItem;
  currentSessionPolicyResult: CurrentSessionPolicyResult;
};

export type PendingApprovalAppResponse = {
  approvalState: "VIEWER";
  clubName: string;
  currentSession: null | {
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    date: string;
    locationLabel: string;
  };
};

export type CreateInvitationRequest = {
  email: string;
  name: string;
};

export type InvitationPreviewResponse = {
  clubName: string;
  email: string;
  name: string;
  emailHint: string;
  status: InvitationStatus;
  expiresAt: string;
  canAccept: boolean;
};

export type InvitationErrorResponse = {
  code: string;
  message: string;
};

export type CurrentSessionResponse = {
  currentSession: null | {
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    bookLink: string | null;
    bookImageUrl: string | null;
    date: string;
    startTime: string;
    endTime: string;
    locationLabel: string;
    meetingUrl: string | null;
    meetingPasscode: string | null;
    questionDeadlineAt: string;
    myRsvpStatus: RsvpStatus;
    myCheckin: null | {
      readingProgress: number;
      note: string;
    };
    myQuestions: Array<{
      priority: number;
      text: string;
      draftThought: string | null;
      authorName: string;
      authorShortName: string;
    }>;
    myOneLineReview: null | {
      text: string;
    };
    myLongReview: null | {
      body: string;
    };
    board: {
      questions: Array<{
        priority: number;
        text: string;
        draftThought: string | null;
        authorName: string;
        authorShortName: string;
      }>;
      checkins: Array<{
        authorName: string;
        authorShortName: string;
        readingProgress: number;
        note: string;
      }>;
      highlights: Array<{
        text: string;
        sortOrder: number;
      }>;
    };
    attendees: Array<{
      membershipId: string;
      displayName: string;
      shortName: string;
      role: MemberRole;
      rsvpStatus: RsvpStatus;
      attendanceStatus: AttendanceStatus;
      participationStatus?: SessionParticipationStatus;
    }>;
  };
};

export type DevLoginRequest = {
  email: string;
};

export type UpdateRsvpRequest = {
  status: RsvpStatus;
};

export type UpdateRsvpResponse = {
  status: RsvpStatus;
};

export type CheckinRequest = {
  readingProgress: number;
  note: string;
};

export type CheckinResponse = CheckinRequest;

export type CreateQuestionRequest = {
  priority: number;
  text: string;
  draftThought?: string | null;
};

export type QuestionResponse = {
  priority: number;
  text: string;
  draftThought: string | null;
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
};

export type MemberArchiveQuestionItem = {
  priority: number;
  text: string;
  draftThought: string | null;
  authorName: string;
  authorShortName: string;
};

export type MemberArchiveCheckinItem = {
  authorName: string;
  authorShortName: string;
  readingProgress: number;
  note: string;
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
  clubCheckins: MemberArchiveCheckinItem[];
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
  kind: "ONE_LINE_REVIEW" | "LONG_REVIEW";
  text: string;
};

export type FeedbackDocumentListItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  date: string;
  fileName: string;
  uploadedAt: string;
};

export type FeedbackDocumentResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  subtitle: string;
  bookTitle: string;
  date: string;
  fileName: string;
  uploadedAt: string;
  metadata: Array<{
    label: string;
    value: string;
  }>;
  observerNotes: string[];
  participants: Array<{
    number: number;
    name: string;
    role: string;
    style: string[];
    contributions: string[];
    problems: Array<{
      title: string;
      core: string;
      evidence: string;
      interpretation: string;
    }>;
    actionItems: string[];
    revealingQuote: {
      quote: string;
      context: string;
      note: string;
    };
  }>;
};

export type FeedbackDocumentStatus = {
  uploaded: boolean;
  fileName: string | null;
  uploadedAt: string | null;
};

export type HostSessionPublication = {
  publicSummary: string;
  isPublic: boolean;
};

export type NoteFeedItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  authorName: string | null;
  authorShortName: string | null;
  kind: string;
  text: string;
};

export type NoteSessionItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  questionCount: number;
  oneLinerCount: number;
  highlightCount: number;
  checkinCount: number;
  totalCount: number;
};

export type PublicSessionListItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  summary: string;
  highlightCount: number;
  oneLinerCount: number;
};

export type PublicClubResponse = {
  clubName: string;
  tagline: string;
  about: string;
  stats: {
    sessions: number;
    books: number;
    members: number;
  };
  recentSessions: PublicSessionListItem[];
};

export type PublicOneLiner = {
  authorName: string;
  authorShortName: string;
  text: string;
};

export type PublicSessionDetailResponse = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  summary: string;
  highlights: string[];
  oneLiners: PublicOneLiner[];
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

export type HostDashboardResponse = {
  rsvpPending: number;
  checkinMissing: number;
  publishPending: number;
  feedbackPending: number;
  currentSessionMissingMemberCount?: number;
  currentSessionMissingMembers?: Array<{
    membershipId: string;
    displayName: string;
    email: string;
  }>;
};

export type HostSessionDetailResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink: string | null;
  bookImageUrl: string | null;
  locationLabel: string;
  meetingUrl: string | null;
  meetingPasscode: string | null;
  date: string;
  startTime: string;
  endTime: string;
  questionDeadlineAt: string;
  publication: HostSessionPublication | null;
  state: SessionState;
  attendees: Array<{
    membershipId: string;
    displayName: string;
    shortName: string;
    rsvpStatus: RsvpStatus;
    attendanceStatus: AttendanceStatus;
    participationStatus?: SessionParticipationStatus;
  }>;
  feedbackDocument: FeedbackDocumentStatus;
};

export type HostSessionDeletionCounts = {
  participants: number;
  rsvpResponses: number;
  questions: number;
  checkins: number;
  oneLineReviews: number;
  longReviews: number;
  highlights: number;
  publications: number;
  feedbackReports: number;
  feedbackDocuments: number;
};

export type HostSessionDeletionPreviewResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  state: SessionState;
  canDelete: boolean;
  counts: HostSessionDeletionCounts;
};

export type HostSessionDeletionResponse = {
  sessionId: string;
  sessionNumber: number;
  deleted: true;
  counts: HostSessionDeletionCounts;
};

export type HostSessionRequest = {
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink?: string | null;
  bookImageUrl?: string | null;
  locationLabel?: string | null;
  meetingUrl?: string | null;
  meetingPasscode?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  questionDeadlineAt?: string | null;
};

export type CreatedSessionResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink: string | null;
  bookImageUrl: string | null;
  locationLabel: string;
  meetingUrl: string | null;
  meetingPasscode: string | null;
  date: string;
  questionDeadlineAt: string;
  state: SessionState;
};

export async function readmatesFetchResponse(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const bodyIsFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!headers.has("Content-Type") && !bodyIsFormData) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api/bff${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
    throw new Error("ReadMates session expired");
  }

  return response;
}

export async function readmatesFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await readmatesFetchResponse(path, init);

  if (!response.ok) {
    throw new Error(`ReadMates API failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
