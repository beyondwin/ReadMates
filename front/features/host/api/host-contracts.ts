import type { AttendanceStatus, RsvpStatus, SessionState } from "@/shared/model/readmates-types";
export type { AttendanceStatus, RsvpStatus, SessionState } from "@/shared/model/readmates-types";

export type MemberRole = "HOST" | "MEMBER";
export type MembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
export type SessionParticipationStatus = "ACTIVE" | "REMOVED";
export type CurrentSessionPolicy = "APPLY_NOW" | "NEXT_SESSION";
export type CurrentSessionPolicyResult = "APPLIED" | "NOT_APPLICABLE" | "DEFERRED";

export type CreateInvitationRequest = {
  email: string;
  name: string;
};

export type FeedbackDocumentStatus = {
  uploaded: boolean;
  fileName: string | null;
  uploadedAt: string | null;
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
      oneLineReviews: Array<{
        authorName: string;
        authorShortName: string;
        text: string;
      }>;
      highlights: Array<{
        text: string;
        sortOrder: number;
      }>;
    };
    attendees: Array<{
      membershipId: string;
      displayName: string;
      accountName: string;
      role: MemberRole;
      rsvpStatus: RsvpStatus;
      attendanceStatus: AttendanceStatus;
      participationStatus?: SessionParticipationStatus;
    }>;
  };
};

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

export type CreateHostInvitationRequest = CreateInvitationRequest & {
  applyToCurrentSession?: boolean;
};

export type ViewerMember = {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  accountName: string;
  profileImageUrl: string | null;
  status: MembershipStatus;
  createdAt: string;
};

export type HostMemberListItem = {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  accountName: string;
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

export type UpdateHostMemberProfileRequest = {
  displayName: string;
};

export type HostMemberProfileErrorCode =
  | "DISPLAY_NAME_REQUIRED"
  | "DISPLAY_NAME_TOO_LONG"
  | "DISPLAY_NAME_INVALID"
  | "DISPLAY_NAME_RESERVED"
  | "DISPLAY_NAME_DUPLICATE"
  | "HOST_ROLE_REQUIRED"
  | "MEMBER_NOT_FOUND"
  | "MEMBERSHIP_NOT_ALLOWED";

export type HostMemberProfileResponse = HostMemberListItem;

export type MemberLifecycleRequest = {
  currentSessionPolicy: CurrentSessionPolicy;
};

export type MemberLifecycleResponse = {
  member: HostMemberListItem;
  currentSessionPolicyResult: CurrentSessionPolicyResult;
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

export type SessionRecordVisibility = "HOST_ONLY" | "MEMBER" | "PUBLIC";

export type HostSessionListItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string;
  state: SessionState;
  visibility: SessionRecordVisibility;
};

export type HostSessionVisibilityRequest = {
  visibility: SessionRecordVisibility;
};

export type HostSessionPublication = {
  publicSummary: string;
  visibility: SessionRecordVisibility;
};

export type HostSessionPublicationRequest = {
  publicSummary: string;
  visibility: SessionRecordVisibility;
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
  visibility: SessionRecordVisibility;
  publication: HostSessionPublication | null;
  state: SessionState;
  attendees: Array<{
    membershipId: string;
    displayName: string;
    accountName: string;
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
  startTime: string;
  endTime: string;
  questionDeadlineAt: string;
  state: SessionState;
  visibility: SessionRecordVisibility;
};

export type HostAttendanceUpdate = {
  membershipId: string;
  attendanceStatus: AttendanceStatus;
};
