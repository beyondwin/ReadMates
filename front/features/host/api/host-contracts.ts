import { z } from "zod";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import type { AttendanceStatus, RsvpStatus, SessionState } from "@/shared/model/readmates-types";
import type { PagedResponse } from "@/shared/model/paging";
export type { AttendanceStatus, RsvpStatus, SessionState } from "@/shared/model/readmates-types";
export type { CurrentSessionResponse } from "@/shared/model/current-session-contracts";

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

export type ViewerMemberPage = PagedResponse<ViewerMember>;

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

export type HostNotificationStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "DEAD";
export type NotificationEventOutboxStatus = "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "DEAD";
export type NotificationDeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "DEAD" | "SKIPPED";
export type NotificationChannel = "EMAIL" | "IN_APP";
export type NotificationDispatchSource = "AUTOMATIC" | "MANUAL";
export type HostNotificationEventType =
  | "NEXT_BOOK_PUBLISHED"
  | "SESSION_REMINDER_DUE"
  | "FEEDBACK_DOCUMENT_PUBLISHED"
  | "REVIEW_PUBLISHED";
export type ManualNotificationAudience = "ALL_ACTIVE_MEMBERS" | "SESSION_PARTICIPANTS" | "CONFIRMED_ATTENDEES";
export type ManualNotificationRequestedChannels = "IN_APP" | "EMAIL" | "BOTH";
export type ManualNotificationSendMode = "NOW";
export type ManualNotificationEligibility = "ELIGIBLE" | "INELIGIBLE" | "EMAIL_DISABLED" | "EMAIL_MISSING";

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

export type HostNotificationItem = {
  id: string;
  eventType: HostNotificationEventType;
  status: HostNotificationStatus;
  recipientEmail: string;
  attemptCount: number;
  nextAttemptAt: string;
  updatedAt: string;
};

export type HostNotificationItemListResponse = {
  items: HostNotificationItem[];
  nextCursor: string | null;
};

export type HostNotificationEventItem = {
  id: string;
  eventType: HostNotificationEventType;
  status: NotificationEventOutboxStatus;
  attemptCount: number;
  source?: NotificationDispatchSource;
  manualDispatch?: HostNotificationManualDispatchMetadata | null;
  createdAt: string;
  updatedAt: string;
};

export type HostNotificationManualDispatchMetadata = {
  manualDispatchId: string;
  requestedChannels: ManualNotificationRequestedChannels;
  audience: ManualNotificationAudience;
  resend: boolean;
  requestedBy: string;
  targetCount: number;
  expectedInAppCount: number;
  expectedEmailCount: number;
};

export type HostNotificationEventListResponse = {
  items: HostNotificationEventItem[];
  nextCursor: string | null;
};

export type HostNotificationDeliveryItem = {
  id: string;
  eventId: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  recipientEmail: string | null;
  attemptCount: number;
  updatedAt: string;
};

export type HostNotificationDeliveryListResponse = {
  items: HostNotificationDeliveryItem[];
  nextCursor: string | null;
};

export type HostSessionClosingOverallState = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "READY" | "PUBLISHED";
export type HostSessionClosingPrimaryAction =
  | "CLOSE_SESSION"
  | "IMPORT_RECORDS"
  | "PUBLISH_RECORDS"
  | "SEND_NOTIFICATION"
  | "REVIEW_PUBLIC_PAGE"
  | "NONE";
export type HostSessionClosingChecklistId =
  | "SESSION_CLOSED"
  | "RECORD_PACKAGE_SAVED"
  | "FEEDBACK_DOCUMENT_READY"
  | "MEMBER_NOTIFICATION_SENT"
  | "PUBLIC_RECORD_VISIBLE"
  | "PUBLIC_SHOWCASE_READY";
export type HostSessionClosingChecklistState = "DONE" | "ACTION_REQUIRED" | "BLOCKED" | "NOT_APPLICABLE";
export type HostSessionClosingFeedbackDocumentState = "AVAILABLE" | "MISSING" | "LOCKED" | "INVALID";
export type HostSessionClosingNotificationStatus = "PENDING" | "PUBLISHED" | "FAILED" | "DEAD";

export type HostSessionClosingStatusResponse = {
  schema: "host.session_closing_status.v1";
  session: {
    sessionId: string;
    sessionNumber: number;
    bookTitle: string;
    meetingDate: string;
    state: SessionState;
    recordVisibility: "HOST_ONLY" | "MEMBER" | "PUBLIC";
  };
  overall: {
    state: HostSessionClosingOverallState;
    label: string;
    primaryAction: HostSessionClosingPrimaryAction;
  };
  checklist: Array<{
    id: HostSessionClosingChecklistId;
    state: HostSessionClosingChecklistState;
    label: string;
    detail: string;
    href: string | null;
  }>;
  evidence: {
    summaryPublished: boolean;
    highlightCount: number;
    oneLinerCount: number;
    feedbackDocumentState: HostSessionClosingFeedbackDocumentState;
    latestNotificationEvent: {
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED" | "NEXT_BOOK_PUBLISHED";
      status: HostSessionClosingNotificationStatus;
      createdAt: string;
    } | null;
    publicRecordHref: string | null;
    memberReflectionHref: string | null;
  };
};

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
  eventStatus: NotificationEventOutboxStatus;
  createdAt: string;
};

export type ManualNotificationDispatchListResponse = PagedResponse<ManualNotificationDispatchListItem>;

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
  status: NotificationEventOutboxStatus;
  createdAt: string;
  summary: {
    targetCount: number;
    requestedChannels: ManualNotificationRequestedChannels;
    expectedInAppCount: number;
    expectedEmailCount: number;
  };
};

export type HostNotificationMetadata = {
  sessionNumber?: number;
  bookTitle?: string;
};

export type HostNotificationDetailResponse = {
  id: string;
  eventType: HostNotificationEventType;
  status: HostNotificationStatus;
  recipientEmail: string;
  subject: string;
  deepLinkPath: string;
  metadata: HostNotificationMetadata;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SendNotificationTestMailRequest = {
  recipientEmail: string;
};

export type NotificationTestMailAuditItem = {
  id: string;
  recipientEmail: string;
  status: "SENT" | "FAILED";
  lastError: string | null;
  createdAt: string;
};

export type NotificationTestMailAuditPage = PagedResponse<NotificationTestMailAuditItem>;

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

export type HostSessionListPage = PagedResponse<HostSessionListItem>;

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

export type SessionImportRecordRequest = {
  authorName: string;
  text: string;
};

export type SessionImportFileRequest = {
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

export type SessionImportRequest = SessionImportFileRequest & {
  recordVisibility: SessionRecordVisibility;
};

export type SessionImportIssue = {
  code: string;
  message: string;
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
  issues: SessionImportIssue[];
};

export type SessionImportCommitResponse = {
  sessionId: string;
  publication: {
    summary: string;
  };
  highlights: SessionImportRecordPreview[];
  oneLineReviews: SessionImportRecordPreview[];
  feedbackDocument: {
    uploaded: boolean;
    fileName: string;
    title: string;
    uploadedAt: string | null;
  };
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

export type HostClubOperationsResponse = HostClubOperationsSnapshot;

// ---------------------------------------------------------------------------
// Zod runtime validators — DEV-only, tree-shaken from production bundle.
// Each schema constant is wrapped in `import.meta.env.DEV ? ... : null as never`
// so Rollup dead-code-eliminates all z.* references in production, allowing
// the `import { z } from "zod"` import to be tree-shaken from the bundle.
// ---------------------------------------------------------------------------

export const HostSessionDetailResponseSchema = import.meta.env.DEV
  ? z.object({
      sessionId: z.string(),
      sessionNumber: z.number(),
      title: z.string(),
      bookTitle: z.string(),
      bookAuthor: z.string(),
      bookLink: z.string().nullable(),
      bookImageUrl: z.string().nullable(),
      locationLabel: z.string(),
      meetingUrl: z.string().nullable(),
      meetingPasscode: z.string().nullable(),
      date: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      questionDeadlineAt: z.string(),
      visibility: z.enum(["HOST_ONLY", "MEMBER", "PUBLIC"]),
      publication: z
        .object({
          publicSummary: z.string(),
          visibility: z.enum(["HOST_ONLY", "MEMBER", "PUBLIC"]),
        })
        .nullable(),
      state: z.enum(["DRAFT", "OPEN", "PUBLISHED", "CLOSED"]),
      attendees: z.array(
        z.object({
          membershipId: z.string(),
          displayName: z.string(),
          accountName: z.string(),
          rsvpStatus: z.enum(["NO_RESPONSE", "GOING", "MAYBE", "DECLINED"]),
          attendanceStatus: z.enum(["UNKNOWN", "ATTENDED", "ABSENT"]),
          participationStatus: z.enum(["ACTIVE", "REMOVED"]).optional(),
        }),
      ),
      feedbackDocument: z.object({
        uploaded: z.boolean(),
        fileName: z.string().nullable(),
        uploadedAt: z.string().nullable(),
      }),
    })
  : (null as never);

export const HostNotificationDeliveryListResponseSchema = import.meta.env.DEV
  ? z.object({
      items: z.array(
        z.object({
          id: z.string(),
          eventId: z.string(),
          channel: z.enum(["EMAIL", "IN_APP"]),
          status: z.enum(["PENDING", "SENDING", "SENT", "FAILED", "DEAD", "SKIPPED"]),
          recipientEmail: z.string().nullable(),
          attemptCount: z.number(),
          updatedAt: z.string(),
        }),
      ),
      // nextCursor may be omitted by the backend — nullable().optional() handles both null and missing
      nextCursor: z.string().nullable().optional(),
    })
  : (null as never);

export const SessionImportPreviewResponseSchema = import.meta.env.DEV
  ? z.object({
      valid: z.boolean(),
      session: z.object({
        sessionNumber: z.number().nullable(),
        bookTitle: z.string().nullable(),
        meetingDate: z.string().nullable(),
      }),
      publication: z.object({
        summary: z.string(),
      }),
      highlights: z.array(
        z.object({
          authorName: z.string(),
          text: z.string(),
          authorMatched: z.boolean(),
          membershipId: z.string().nullable(),
        }),
      ),
      oneLineReviews: z.array(
        z.object({
          authorName: z.string(),
          text: z.string(),
          authorMatched: z.boolean(),
          membershipId: z.string().nullable(),
        }),
      ),
      feedbackDocument: z.object({
        fileName: z.string(),
        title: z.string().nullable(),
        valid: z.boolean(),
      }),
      issues: z.array(
        z.object({
          code: z.string(),
          message: z.string(),
        }),
      ),
    })
  : (null as never);

export const HostInvitationListPageSchema = import.meta.env.DEV
  ? z.object({
      items: z.array(
        z.object({
          invitationId: z.string(),
          email: z.string(),
          name: z.string(),
          role: z.enum(["HOST", "MEMBER"]),
          status: z.enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]),
          effectiveStatus: z.enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]),
          expiresAt: z.string(),
          acceptedAt: z.string().nullable(),
          createdAt: z.string(),
          applyToCurrentSession: z.boolean(),
          canRevoke: z.boolean(),
          canReissue: z.boolean(),
        }),
      ),
      nextCursor: z.string().nullable(),
    })
  : (null as never);

// Type aliases — erased at build time, z.infer<> resolves from the truthy branch
export type HostSessionDetailResponseParsed = z.infer<typeof HostSessionDetailResponseSchema>;
export type HostNotificationDeliveryListResponseParsed = z.infer<typeof HostNotificationDeliveryListResponseSchema>;
export type HostInvitationListPageParsed = z.infer<typeof HostInvitationListPageSchema>;
export type SessionImportPreviewResponseParsed = z.infer<typeof SessionImportPreviewResponseSchema>;

export function parseHostSessionDetailResponse(value: unknown): HostSessionDetailResponse {
  if (import.meta.env.DEV) {
    return HostSessionDetailResponseSchema.parse(value) as HostSessionDetailResponse;
  }
  return value as HostSessionDetailResponse;
}

export function parseHostNotificationDeliveryListResponse(value: unknown): HostNotificationDeliveryListResponse {
  if (import.meta.env.DEV) {
    return HostNotificationDeliveryListResponseSchema.parse(value) as HostNotificationDeliveryListResponse;
  }
  return value as HostNotificationDeliveryListResponse;
}

export function parseHostInvitationListPage(value: unknown): HostInvitationListPage {
  if (import.meta.env.DEV) {
    return HostInvitationListPageSchema.parse(value) as HostInvitationListPage;
  }
  return value as HostInvitationListPage;
}

export function parseSessionImportPreviewResponse(value: unknown): SessionImportPreviewResponse {
  if (import.meta.env.DEV) {
    return SessionImportPreviewResponseSchema.parse(value) as SessionImportPreviewResponse;
  }
  return value as SessionImportPreviewResponse;
}
