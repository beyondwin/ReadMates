import type { PagedResponse } from "@/shared/model/paging";
import type { AttendanceStatus, RsvpStatus, SessionState } from "@/shared/model/readmates-types";

export type { CurrentSessionResponse } from "@/shared/model/current-session-contracts";
export type { AttendanceStatus } from "@/shared/model/readmates-types";

export type MemberRole = "HOST" | "MEMBER";
export type MembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
export type SessionParticipationStatus = "ACTIVE" | "REMOVED";
export type CurrentSessionPolicy = "APPLY_NOW" | "NEXT_SESSION";
export type CurrentSessionPolicyResult = "APPLIED" | "NOT_APPLICABLE" | "DEFERRED";
export type SessionRecordVisibility = "HOST_ONLY" | "MEMBER" | "PUBLIC";

export type HostSessionVisibilityRequest = {
  visibility: SessionRecordVisibility;
  previewId?: string | null;
  notificationDecision?: "SEND" | "SKIP" | null;
};

export type HostSessionVisibilityPreviewResponse = {
  previewId: string;
  targetCount: number;
  expectedInAppCount: number;
  expectedEmailCount: number;
  excludedCount: number;
  expiresAt: string;
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

export type HostInvitationListPage = PagedResponse<HostInvitationListItem>;

export type HostInvitationResponse = HostInvitationListItem & {
  acceptUrl: string | null;
};

export type CreateHostInvitationRequest = {
  email: string;
  name: string;
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

export type HostMemberListPage = PagedResponse<HostMemberListItem>;

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

export type HostNotificationEventType =
  | "NEXT_BOOK_PUBLISHED"
  | "SESSION_REMINDER_DUE"
  | "FEEDBACK_DOCUMENT_PUBLISHED"
  | "REVIEW_PUBLISHED"
  | "SESSION_RECORD_UPDATED";
export type NotificationDispatchSource = "AUTOMATIC" | "MANUAL" | "HOST_CONFIRMED";

export type HostNotificationSummary = {
  pending: number;
  failed: number;
  dead: number;
  sentLast24h: number;
  latestFailures: Array<{
    id: string;
    eventType: HostNotificationEventType;
    recipientEmail: string;
    attemptCount: number;
    updatedAt: string;
  }>;
};

export type ManualNotificationAudience = "ALL_ACTIVE_MEMBERS" | "SESSION_PARTICIPANTS" | "CONFIRMED_ATTENDEES";
export type ManualNotificationRequestedChannels = "IN_APP" | "EMAIL" | "BOTH";
export type ManualNotificationSendMode = "NOW";
export type ManualNotificationEligibility = "ELIGIBLE" | "INELIGIBLE" | "EMAIL_DISABLED" | "EMAIL_MISSING";

export type ManualNotificationTemplateOption = {
  eventType: HostNotificationEventType;
  label: string;
  enabled: boolean;
  disabledReason: string | null;
  defaultAudience: ManualNotificationAudience;
  allowedAudiences: ManualNotificationAudience[];
  defaultChannels: ManualNotificationRequestedChannels;
};

export type ManualNotificationMemberOption = {
  membershipId: string;
  displayName: string;
  maskedEmail: string;
  role: MemberRole;
  membershipStatus: MembershipStatus;
  sessionParticipationStatus: SessionParticipationStatus | null;
  attendanceStatus: AttendanceStatus | null;
  emailEligibility: ManualNotificationEligibility;
  inAppEligibility: ManualNotificationEligibility;
};

export type ManualNotificationOptionsResponse = {
  session: ManualNotificationSessionSummary | null;
  templates: ManualNotificationTemplateOption[];
  members: PagedResponse<ManualNotificationMemberOption>;
  recentDispatches: ManualNotificationDispatchListItem[];
};

export type ManualNotificationSessionSummary = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string | null;
  state: string;
  visibility: string;
  feedbackDocumentUploaded: boolean;
};

export type ManualNotificationDispatchListItem = {
  manualDispatchId: string;
  eventId: string;
  source: "MANUAL";
  eventType: HostNotificationEventType;
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  requestedChannels: ManualNotificationRequestedChannels;
  audience: ManualNotificationAudience;
  resend: boolean;
  requestedBy: string;
  targetCount: number;
  expectedInAppCount: number;
  expectedEmailCount: number;
  eventStatus: "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "DEAD";
  createdAt: string;
};

export type ManualNotificationSelectionRequest = {
  sessionId: string;
  eventType: HostNotificationEventType;
  audience: ManualNotificationAudience;
  requestedChannels: ManualNotificationRequestedChannels;
  excludedMembershipIds: string[];
  includedMembershipIds: string[];
  sendMode: ManualNotificationSendMode;
};

export type ManualNotificationPreviewRequest = ManualNotificationSelectionRequest;

export type ManualNotificationPreviewResponse = {
  previewId: string;
  expiresAt: string;
  template: {
    eventType: HostNotificationEventType;
    label: string;
    subject: string;
    bodyPreview: string;
  };
  audience: {
    baseGroup: ManualNotificationAudience;
    baseCount: number;
    excludedCount: number;
    includedCount: number;
    finalTargetCount: number;
  };
  channels: {
    requested: ManualNotificationRequestedChannels;
    inAppEligibleCount: number;
    emailEligibleCount: number;
    emailSkippedByPreferenceCount: number;
    emailMissingCount: number;
  };
  duplicates: {
    requiresResendConfirmation: boolean;
    recentDispatches: Array<{
      manualDispatchId: string;
      eventType: HostNotificationEventType;
      requestedChannels: ManualNotificationRequestedChannels;
      createdAt: string;
      requestedBy: string;
      targetCount: number;
    }>;
  };
  warnings: Array<{ code: string; message: string }>;
};

export type ManualNotificationConfirmRequest = ManualNotificationSelectionRequest & {
  previewId: string;
  resendConfirmed: boolean;
};

export type ManualNotificationConfirmResponse = {
  manualDispatchId: string;
  eventId: string;
  status: "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "DEAD";
  createdAt: string;
  summary: {
    targetCount: number;
    requestedChannels: ManualNotificationRequestedChannels;
    expectedInAppCount: number;
    expectedEmailCount: number;
  };
};

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

export type HostSessionListPage = PagedResponse<HostSessionListItem>;

export type HostSessionPublication = {
  publicSummary: string;
  visibility: SessionRecordVisibility;
};

export type SessionImportRecordRequest = {
  authorName: string;
  text: string;
};

export type SessionImportRequest = {
  recordVisibility: SessionRecordVisibility;
  expectedDraftRevision: number | null;
  format: "readmates-session-import:v1";
  session: {
    number: number;
    bookTitle: string;
    meetingDate: string;
  };
  publication: {
    summary: string;
  };
  highlights: SessionImportRecordRequest[];
  oneLineReviews: SessionImportRecordRequest[];
  feedbackDocument: {
    fileName: string;
    markdown: string;
  };
};

export type SessionImportRecordPreview = {
  authorName: string;
  text: string;
  authorMatched: boolean;
  membershipId: string | null;
};

export type SessionImportPreviewResponse = {
  valid: boolean;
  session: {
    sessionNumber: number | null;
    bookTitle: string | null;
    meetingDate: string | null;
  };
  publication: {
    summary: string;
  };
  highlights: SessionImportRecordPreview[];
  oneLineReviews: SessionImportRecordPreview[];
  feedbackDocument: {
    fileName: string;
    title: string | null;
    valid: boolean;
  };
  issues: Array<{
    code: string;
    message: string;
  }>;
};

export type SessionImportCommitResponse = {
  sessionId: string;
  draftRevision: number;
  baseLiveRevision: number;
  liveApplied: boolean;
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
