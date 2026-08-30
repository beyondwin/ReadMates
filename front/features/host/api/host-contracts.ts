import { z } from "zod";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import type { AttendanceStatus, RsvpStatus, SessionState } from "@/shared/model/readmates-types";
import type { PagedResponse } from "@/shared/model/paging";
import type { HostSessionChangeReceipt } from "./host-session-recovery-contracts";
import {
  HostAttendanceResponseSchema,
  HostSessionChangeReceiptSchema,
} from "./host-session-recovery-contracts";
import type {
  HostNotificationComposerContext,
  SessionRecordStatus,
} from "./host-session-record-contracts";
import type {
  PublicSiteVisibility,
  SessionAccessScope,
} from "../model/session-exposure-model";
export type { AttendanceStatus, RsvpStatus, SessionState } from "@/shared/model/readmates-types";
export type { CurrentSessionResponse } from "@/shared/model/current-session-contracts";

export const HostOperatingRoomCurrentResponseSchema = z.object({
  currentMeeting: z.object({
    sessionId: z.string().min(1),
    selection: z.enum(["OPEN", "UPCOMING_DRAFT", "CLOSING_REQUIRED"]),
    scheduleSeenAvailability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  }).strict().nullable(),
}).strict();

export type HostOperatingRoomCurrentResponse = z.infer<typeof HostOperatingRoomCurrentResponseSchema>;

export function parseHostOperatingRoomCurrentResponse(value: unknown): HostOperatingRoomCurrentResponse {
  return HostOperatingRoomCurrentResponseSchema.parse(value);
}

export type MemberRole = "HOST" | "MEMBER";
export type MembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
export type SessionParticipationStatus = "ACTIVE" | "REMOVED";
export type CurrentSessionPolicy = "APPLY_NOW" | "NEXT_SESSION";
export type CurrentSessionPolicyResult = "APPLIED" | "NOT_APPLICABLE" | "DEFERRED";

export type HostVersionVector = {
  sessionRevision: number;
  scheduleRevision: number;
  exposureRevision: number;
  participantSetRevision: number;
  recordDraftRevision: number | null;
  liveRecordRevision: number | null;
  publicationRevision: number;
};

export type HostMutationEnvelope<TCommand, TExpected> = {
  idempotencyKey: string;
  expected: TExpected;
  command: TCommand;
};

export type ExpectedSessionRevision = { sessionRevision: number };
export type AttendanceVersion = { membershipId: string; attendanceRevision: number };
export type ExpectedAttendanceVersions = {
  rows: AttendanceVersion[];
  participantSetRevision?: number;
};
export type ExpectedCloseRevisions = ExpectedSessionRevision & {
  participantSetRevision: number;
  attendanceSnapshotId: string;
};
export type ExpectedExposureRevision = { exposureRevision: number };
export type ExpectedPublicationRevision = {
  publicationRevision: number;
  exposureRevision?: number;
};
export type PublicationVersionVector = ExpectedSessionRevision & {
  liveRecordRevision: number;
  exposureRevision: number;
  publicationRevision: number;
};
export type CorrectionPublicationVersionVector = PublicationVersionVector & {
  recordDraftRevision: number;
};

export type HostProjectionSnapshot = {
  snapshotId: string;
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string;
  state: SessionState;
  versions: HostVersionVector;
  accessScope: SessionAccessScope;
  siteVisibility: PublicSiteVisibility;
  visibility: SessionRecordVisibility;
};

export type HostMutationReceipt = {
  receiptId: string;
  operation: HostMutationOperation;
  resourceId: string;
  resultingVersions: HostVersionVector;
  notificationDecision: "NOT_SENT" | "DISPATCH_REFERENCED";
  projection: HostProjectionSnapshot;
};

export type HostMutationReconciliation = {
  status: "COMMITTED" | "NOT_EXECUTED" | "PENDING";
  receipt: HostMutationReceipt | null;
  current: HostProjectionSnapshot | null;
  attendanceVersions: AttendanceVersion[] | null;
  attendanceSnapshotId: string | null;
};

export type HostPublicConvergenceView = {
  convergenceId: string;
  originResult: "APPLIED" | "READABLE" | "DENIED";
  committedGeneration: number;
  status: "QUEUED" | "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  lastAttemptAt: string | null;
  retryable: boolean;
};

export const HostPublicConvergenceViewSchema = z.object({
  convergenceId: z.string().uuid(),
  originResult: z.enum(["APPLIED", "READABLE", "DENIED"]),
  committedGeneration: z.number().int().nonnegative(),
  status: z.enum(["QUEUED", "PENDING", "SUCCEEDED", "FAILED", "EXPIRED"]),
  lastAttemptAt: z.string().datetime({ offset: true }).nullable(),
  retryable: z.boolean(),
}).strict();

export type HostMutationOperation =
  | "SESSION_CREATE"
  | "SESSION_BASIC_SAVE"
  | "SESSION_ATTENDANCE_SINGLE"
  | "SESSION_ATTENDANCE_BULK"
  | "SESSION_EXPOSURE"
  | "SESSION_PUBLICATION"
  | "SESSION_OPEN"
  | "SESSION_CLOSE"
  | "SESSION_REVERSE"
  | "SESSION_RECORD_APPLY"
  | "SESSION_PUBLISH"
  | "SESSION_CORRECTION_PUBLISH"
  | "SESSION_TRASH"
  | "SESSION_RESTORE";

const nonNegativeRevision = z.number().int().nonnegative();
const positiveRevision = z.number().int().positive();

export const HostVersionVectorSchema = z.object({
  sessionRevision: nonNegativeRevision,
  scheduleRevision: positiveRevision,
  exposureRevision: nonNegativeRevision,
  participantSetRevision: nonNegativeRevision,
  recordDraftRevision: positiveRevision.nullable(),
  liveRecordRevision: positiveRevision.nullable(),
  publicationRevision: nonNegativeRevision,
}).strict();

export const ExpectedCreateHostSessionSchema = z.object({}).strict();
export const ExpectedSessionRevisionSchema = z.object({
  sessionRevision: nonNegativeRevision,
}).strict();
export const AttendanceVersionSchema = z.object({
  membershipId: z.string().min(1),
  attendanceRevision: nonNegativeRevision,
}).strict();
export const ExpectedAttendanceVersionsSchema = z.object({
  rows: z.array(AttendanceVersionSchema).min(1),
  participantSetRevision: nonNegativeRevision.optional(),
}).strict();
export const ExpectedCloseRevisionsSchema = z.object({
  sessionRevision: nonNegativeRevision,
  participantSetRevision: nonNegativeRevision,
  attendanceSnapshotId: z.string().min(1),
}).strict();
export const ExpectedExposureRevisionSchema = z.object({
  exposureRevision: nonNegativeRevision,
}).strict();
export const ExpectedPublicationRevisionSchema = z.object({
  publicationRevision: nonNegativeRevision,
  exposureRevision: nonNegativeRevision.optional(),
}).strict();
export const PublicationVersionVectorSchema = z.object({
  sessionRevision: nonNegativeRevision,
  liveRecordRevision: nonNegativeRevision,
  exposureRevision: nonNegativeRevision,
  publicationRevision: nonNegativeRevision,
}).strict();
export const CorrectionPublicationVersionVectorSchema = z.object({
  sessionRevision: nonNegativeRevision,
  recordDraftRevision: positiveRevision,
  liveRecordRevision: nonNegativeRevision,
  exposureRevision: nonNegativeRevision,
  publicationRevision: nonNegativeRevision,
}).strict();

export const HostProjectionSnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  sessionId: z.string().min(1),
  sessionNumber: z.number().int().positive(),
  title: z.string(),
  bookTitle: z.string(),
  bookAuthor: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  locationLabel: z.string(),
  state: z.enum(["DRAFT", "OPEN", "PUBLISHED", "CLOSED"]),
  versions: HostVersionVectorSchema,
  accessScope: z.enum(["HOST_ONLY", "GUEST_READABLE"]),
  siteVisibility: z.enum(["HIDDEN", "PUBLIC_RECORD"]),
  visibility: z.enum(["HOST_ONLY", "MEMBER", "PUBLIC"]),
}).strict();

export const HostMutationReceiptSchema = z.object({
  receiptId: z.string().min(1),
  operation: z.enum([
    "SESSION_CREATE",
    "SESSION_BASIC_SAVE",
    "SESSION_ATTENDANCE_SINGLE",
    "SESSION_ATTENDANCE_BULK",
    "SESSION_EXPOSURE",
    "SESSION_PUBLICATION",
    "SESSION_OPEN",
    "SESSION_CLOSE",
    "SESSION_REVERSE",
    "SESSION_RECORD_APPLY",
    "SESSION_PUBLISH",
    "SESSION_CORRECTION_PUBLISH",
    "SESSION_TRASH",
    "SESSION_RESTORE",
  ]),
  resourceId: z.string().min(1),
  resultingVersions: HostVersionVectorSchema,
  notificationDecision: z.enum(["NOT_SENT", "DISPATCH_REFERENCED"]),
  projection: HostProjectionSnapshotSchema,
}).strict();

export const HostMutationReconciliationSchema = z.object({
  status: z.enum(["COMMITTED", "NOT_EXECUTED", "PENDING"]),
  receipt: HostMutationReceiptSchema.nullable(),
  current: HostProjectionSnapshotSchema.nullable(),
  attendanceVersions: z.array(AttendanceVersionSchema).nullable(),
  attendanceSnapshotId: z.string().min(1).nullable(),
}).strict().superRefine((value, context) => {
  if (value.status === "COMMITTED" && value.receipt === null) {
    context.addIssue({ code: "custom", path: ["receipt"], message: "committed reconciliation requires receipt" });
  }
  if (value.status !== "COMMITTED" && value.receipt !== null) {
    context.addIssue({ code: "custom", path: ["receipt"], message: "non-committed reconciliation cannot include receipt" });
  }
});

export const HostMutationIdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9._-]{8,128}$/);

export function hostMutationEnvelopeSchema<TCommand, TExpected>(
  command: z.ZodType<TCommand>,
  expected: z.ZodType<TExpected>,
) {
  return z.object({
    idempotencyKey: HostMutationIdempotencyKeySchema,
    expected,
    command,
  }).strict();
}

export const HostSessionRequestSchema = z.object({
  title: z.string(),
  bookTitle: z.string(),
  bookAuthor: z.string(),
  bookLink: z.string().nullable().optional(),
  bookImageUrl: z.string().nullable().optional(),
  locationLabel: z.string().nullable().optional(),
  meetingUrl: z.string().nullable().optional(),
  meetingPasscode: z.string().nullable().optional(),
  date: z.string(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  questionDeadlineAt: z.string().nullable().optional(),
  accessScope: z.enum(["HOST_ONLY", "GUEST_READABLE"]).optional(),
}).strict();

export const HostLifecycleCommandSchema = z.object({}).strict();
export const HostSessionReverseCommandSchema = z.object({
  reasonCode: z.string().optional(),
  reasonNote: z.string().optional(),
}).strict();
export const HostAttendanceCommandEntrySchema = z.object({
  membershipId: z.string().min(1),
  attendanceStatus: z.enum(["ATTENDED", "ABSENT", "UNKNOWN"]),
  expectedAttendanceRevision: nonNegativeRevision,
}).strict();
export const HostAttendanceCommandSchema = z.object({
  entries: z.array(HostAttendanceCommandEntrySchema).min(1),
}).strict();
export const HostSessionAccessScopeCommandSchema = z.object({
  accessScope: z.enum(["HOST_ONLY", "GUEST_READABLE"]),
}).strict();
export const HostSessionPublicationCommandSchema = z.object({
  publicSummary: z.string().min(1),
  accessScope: z.enum(["HOST_ONLY", "GUEST_READABLE"]).optional(),
  siteVisibility: z.enum(["HIDDEN", "PUBLIC_RECORD"]).optional(),
  visibility: z.enum(["HOST_ONLY", "MEMBER", "PUBLIC"]).optional(),
}).strict();

export const CreateHostSessionMutationEnvelopeSchema = hostMutationEnvelopeSchema(
  HostSessionRequestSchema,
  ExpectedCreateHostSessionSchema,
);
export const UpdateHostSessionMutationEnvelopeSchema = hostMutationEnvelopeSchema(
  HostSessionRequestSchema,
  ExpectedSessionRevisionSchema,
);
export const SessionRevisionMutationEnvelopeSchema = hostMutationEnvelopeSchema(
  HostLifecycleCommandSchema,
  ExpectedSessionRevisionSchema,
);
export const ReverseHostSessionMutationEnvelopeSchema = hostMutationEnvelopeSchema(
  HostSessionReverseCommandSchema,
  ExpectedSessionRevisionSchema,
);
export const CloseHostSessionMutationEnvelopeSchema = hostMutationEnvelopeSchema(
  HostLifecycleCommandSchema,
  ExpectedCloseRevisionsSchema,
);
export const PublishHostSessionMutationEnvelopeSchema = hostMutationEnvelopeSchema(
  HostLifecycleCommandSchema,
  PublicationVersionVectorSchema,
);
export const CorrectionPublishHostSessionMutationEnvelopeSchema = hostMutationEnvelopeSchema(
  HostLifecycleCommandSchema,
  CorrectionPublicationVersionVectorSchema,
);
export const AccessHostSessionMutationEnvelopeSchema = hostMutationEnvelopeSchema(
  HostSessionAccessScopeCommandSchema,
  ExpectedExposureRevisionSchema,
);
export const PublicationHostSessionMutationEnvelopeSchema = hostMutationEnvelopeSchema(
  HostSessionPublicationCommandSchema,
  ExpectedPublicationRevisionSchema,
).superRefine((envelope, context) => {
  const commandChangesExposure = envelope.command.accessScope !== undefined;
  const expectedIncludesExposure = envelope.expected.exposureRevision !== undefined;
  if (commandChangesExposure !== expectedIncludesExposure) {
    context.addIssue({
      code: "custom",
      path: ["expected", "exposureRevision"],
      message: "exposureRevision must exactly match an accessScope command",
    });
  }
});
export const AttendanceHostSessionMutationEnvelopeSchema = hostMutationEnvelopeSchema(
  HostAttendanceCommandSchema,
  ExpectedAttendanceVersionsSchema,
).superRefine((envelope, context) => {
  const expectedByMembership = new Map(
    envelope.expected.rows.map((row) => [row.membershipId, row.attendanceRevision]),
  );
  const commandMembershipIds = envelope.command.entries.map((entry) => entry.membershipId);
  const exactRows = commandMembershipIds.length === expectedByMembership.size
    && new Set(commandMembershipIds).size === commandMembershipIds.length
    && envelope.command.entries.every(
      (entry) => expectedByMembership.get(entry.membershipId) === entry.expectedAttendanceRevision,
    );
  const participantRevisionShape = envelope.command.entries.length > 1
    ? envelope.expected.participantSetRevision !== undefined
    : envelope.expected.participantSetRevision === undefined;
  if (!exactRows || !participantRevisionShape) {
    context.addIssue({ code: "custom", message: "attendance command and expected versions differ" });
  }
});

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
  avatarKey?: string;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: string | null;
  createdAt: string;
  lastClubAccessAt: string | null;
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

export type HostNotificationStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "DEAD";
export type NotificationEventOutboxStatus = "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "DEAD";
export type NotificationDeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "DEAD" | "SKIPPED";
export type NotificationChannel = "EMAIL" | "IN_APP";
export type NotificationDispatchSource = "AUTOMATIC" | "MANUAL" | "HOST_CONFIRMED";
export type HostNotificationEventType =
  | "NEXT_BOOK_PUBLISHED"
  | "SESSION_REMINDER_DUE"
  | "FEEDBACK_DOCUMENT_PUBLISHED"
  | "REVIEW_PUBLISHED"
  | "SESSION_RECORD_UPDATED";
export type ManualNotificationAudience =
  | "ALL_ACTIVE_MEMBERS"
  | "SESSION_PARTICIPANTS"
  | "CONFIRMED_ATTENDEES"
  | "SELECTED_MEMBERS";
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
    sessionRevision: number;
    participantSetRevision: number;
    attendanceSnapshotId: string;
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
  contentRevision: string;
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
  contentRevision: string;
  audience: ManualNotificationAudience;
  requestedChannels: ManualNotificationRequestedChannels;
  selectedMembershipIds: string[];
  excludedMembershipIds: string[];
  includedMembershipIds: string[];
  sendMode: ManualNotificationSendMode;
};

export type HostNotificationPolicyResponse = {
  sessionReminderEnabled: boolean;
  updatedAt: string | null;
};

export type UpdateHostNotificationPolicyRequest = {
  sessionReminderEnabled: boolean;
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
export type HostListMode = "meeting" | "record";

export type HostListCursorFailure = {
  code: "LIST_CURSOR_STALE";
  restartHref: string;
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
  accessScope?: SessionAccessScope;
  siteVisibility?: PublicSiteVisibility;
  recordStatus: SessionRecordStatus;
  needsAttention: boolean;
  hasDraft: boolean;
  liveRevision: number;
  draftRevision: number | null;
  lastModifiedAt: string | null;
};

export type HostSessionListPage = PagedResponse<HostSessionListItem>;

export type HostSessionLedgerSummary = {
  needsAttentionCount: number;
  incompletePublishedCount: number;
  draftCount: number;
};

export type HostSessionRecordLedgerPage = HostSessionListPage & {
  summary: HostSessionLedgerSummary;
};

export type HostSessionVisibilityRequest = {
  visibility: SessionRecordVisibility;
};

export type HostSessionAccessScopeRequest = {
  accessScope: SessionAccessScope;
};

export type HostSessionVisibilityUpdateResult = {
  session: HostSessionDetailResponse;
  composer: HostNotificationComposerContext | null;
};

export type HostSessionPublication = {
  publicSummary: string;
  visibility: SessionRecordVisibility;
  siteVisibility?: PublicSiteVisibility;
};

export type HostSessionPublicationRequest =
  | {
      publicSummary: string;
      accessScope?: SessionAccessScope;
      siteVisibility: PublicSiteVisibility;
      visibility?: SessionRecordVisibility;
    }
  | {
      publicSummary: string;
      accessScope?: SessionAccessScope;
      visibility: SessionRecordVisibility;
      siteVisibility?: PublicSiteVisibility;
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
  expectedDraftRevision: number | null;
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
  accessScope?: SessionAccessScope;
  siteVisibility?: PublicSiteVisibility;
  publication: HostSessionPublication | null;
  state: SessionState;
  scheduleRevision: number;
  scheduleSeenAvailability: "AVAILABLE" | "UNAVAILABLE";
  scheduleSeenSummary: {
    currentCount: number | null;
    staleCount: number | null;
    unseenCount: number | null;
    eligibleCount: number | null;
  };
  versions: HostVersionVector;
  attendanceSnapshotId: string;
  attendees: Array<{
    membershipId: string;
    avatarKey: string;
    displayName: string;
    accountName: string;
    rsvpStatus: RsvpStatus;
    attendanceStatus: AttendanceStatus;
    participationStatus?: SessionParticipationStatus;
    attendanceRevision: number;
    seenScheduleRevision: number | null;
    scheduleSeenAt: string | null;
    scheduleSeenState: "CURRENT" | "STALE" | "UNSEEN";
  }>;
  feedbackDocument: FeedbackDocumentStatus;
  changeReceipt?: HostSessionChangeReceipt | null;
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

export type HostSessionDeletionBlocker = {
  code: string;
  count: number;
};

export type HostSessionDeletionPreviewResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  state: SessionState;
  canDelete: boolean;
  counts: HostSessionDeletionCounts;
  blockers?: ReadonlyArray<HostSessionDeletionBlocker>;
};

export type HostSessionTrashItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  state: SessionState;
  deletedAt: string;
  purgeAfter: string;
  sessionRevision?: number;
};

export type HostSessionTrashPage = {
  items: HostSessionTrashItem[];
  nextCursor: string | null;
};

export type HostSessionDeletionResponse = HostSessionTrashItem & {
  trashed: true;
  counts: HostSessionDeletionCounts;
};

export type {
  HostSessionAutomaticScheduleDefaults,
  HostSessionScheduleDefaults,
  HostSessionScheduleDefaultsWire,
  PreviousOnlineMeeting,
} from "../model/host-schedule-defaults-state";

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
  accessScope?: SessionAccessScope;
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
  accessScope?: SessionAccessScope;
  composer?: HostNotificationComposerContext | null;
};

export type HostAttendanceUpdate = {
  membershipId: string;
  attendanceStatus: AttendanceStatus;
};

export type HostAttendanceResponse = {
  sessionId: string;
  count: number;
  changeReceipt?: HostSessionChangeReceipt | null;
};

export type HostClubOperationsResponse = HostClubOperationsSnapshot;

// ---------------------------------------------------------------------------
// Zod runtime validators. Most read-only schemas remain DEV-only and are
// tree-shaken from production. Visibility mutation responses are validated in
// every environment before their composer context reaches route state.
// ---------------------------------------------------------------------------

export const HostSessionDetailResponseSchema = z.object({
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
      accessScope: z.enum(["HOST_ONLY", "GUEST_READABLE"]).optional(),
      siteVisibility: z.enum(["HIDDEN", "PUBLIC_RECORD"]).optional(),
      publication: z
        .object({
          publicSummary: z.string(),
          visibility: z.enum(["HOST_ONLY", "MEMBER", "PUBLIC"]),
          siteVisibility: z.enum(["HIDDEN", "PUBLIC_RECORD"]).optional(),
        })
        .nullable(),
      state: z.enum(["DRAFT", "OPEN", "PUBLISHED", "CLOSED"]),
      scheduleRevision: positiveRevision,
      scheduleSeenAvailability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
      scheduleSeenSummary: z.object({
        currentCount: nonNegativeRevision.nullable(),
        staleCount: nonNegativeRevision.nullable(),
        unseenCount: nonNegativeRevision.nullable(),
        eligibleCount: nonNegativeRevision.nullable(),
      }).strict(),
      versions: HostVersionVectorSchema,
      attendanceSnapshotId: z.string().min(1),
      attendees: z.array(
        z.object({
          membershipId: z.string(),
          avatarKey: z.string(),
          displayName: z.string(),
          accountName: z.string(),
          rsvpStatus: z.enum(["NO_RESPONSE", "GOING", "MAYBE", "DECLINED"]),
          attendanceStatus: z.enum(["UNKNOWN", "ATTENDED", "ABSENT"]),
          participationStatus: z.enum(["ACTIVE", "REMOVED"]).optional(),
          attendanceRevision: nonNegativeRevision,
          seenScheduleRevision: positiveRevision.nullable(),
          scheduleSeenAt: z.string().datetime({ offset: true }).nullable(),
          scheduleSeenState: z.enum(["CURRENT", "STALE", "UNSEEN"]),
        }),
      ),
      feedbackDocument: z.object({
        uploaded: z.boolean(),
        fileName: z.string().nullable(),
        uploadedAt: z.string().nullable(),
      }),
      changeReceipt: HostSessionChangeReceiptSchema.nullable().optional(),
    });

export const HostMemberListItemSchema = z.object({
  membershipId: z.string(),
  userId: z.string(),
  email: z.string(),
  displayName: z.string(),
  accountName: z.string(),
  profileImageUrl: z.string().nullable(),
  avatarKey: z.string().optional(),
  role: z.enum(["HOST", "MEMBER"]),
  status: z.enum(["INVITED", "VIEWER", "ACTIVE", "SUSPENDED", "LEFT", "INACTIVE"]),
  joinedAt: z.string().nullable(),
  createdAt: z.string(),
  lastClubAccessAt: z.string().datetime({ offset: true }).nullable(),
  currentSessionParticipationStatus: z.enum(["ACTIVE", "REMOVED"]).nullable(),
  canSuspend: z.boolean(),
  canRestore: z.boolean(),
  canDeactivate: z.boolean(),
  canAddToCurrentSession: z.boolean(),
  canRemoveFromCurrentSession: z.boolean(),
}).strict();

export const HostMemberListPageSchema = import.meta.env?.DEV
  ? z.object({
      items: z.array(HostMemberListItemSchema),
      nextCursor: z.string().nullable(),
    })
  : (null as never);

export const HostSessionVisibilityUpdateResponseSchema = z.object({
      session: HostSessionDetailResponseSchema,
      composer: z.object({
        sessionId: z.string(),
        eventType: z.enum([
          "NEXT_BOOK_PUBLISHED",
          "FEEDBACK_DOCUMENT_PUBLISHED",
          "SESSION_RECORD_UPDATED",
        ]),
        contentRevision: z.string(),
      }).strict().nullable(),
    }).strict();

export const HostNotificationDeliveryListResponseSchema = import.meta.env?.DEV
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

export const SessionImportPreviewResponseSchema = import.meta.env?.DEV
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

export const HostInvitationListPageSchema = import.meta.env?.DEV
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
export type HostMemberListPageParsed = z.infer<typeof HostMemberListPageSchema>;
export type HostSessionVisibilityUpdateResponseParsed = z.infer<typeof HostSessionVisibilityUpdateResponseSchema>;
export type HostNotificationDeliveryListResponseParsed = z.infer<typeof HostNotificationDeliveryListResponseSchema>;
export type HostInvitationListPageParsed = z.infer<typeof HostInvitationListPageSchema>;
export type SessionImportPreviewResponseParsed = z.infer<typeof SessionImportPreviewResponseSchema>;

export function parseHostSessionDetailResponse(value: unknown): HostSessionDetailResponse {
  if (import.meta.env.DEV) {
    return HostSessionDetailResponseSchema.parse(value) as HostSessionDetailResponse;
  }
  return value as HostSessionDetailResponse;
}

export function parseHostAttendanceResponse(value: unknown): HostAttendanceResponse {
  return HostAttendanceResponseSchema.parse(value) as HostAttendanceResponse;
}

export function parseHostMemberListPage(value: unknown): HostMemberListPage {
  if (import.meta.env.DEV) {
    return HostMemberListPageSchema.parse(value) as HostMemberListPage;
  }
  return value as HostMemberListPage;
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

const sessionStateSchema = z.enum(["DRAFT", "OPEN", "PUBLISHED", "CLOSED"]);

const HostSessionListItemSchema = z.object({
  sessionId: z.string(),
  sessionNumber: z.number().int().nonnegative(),
  title: z.string(),
  bookTitle: z.string(),
  bookAuthor: z.string(),
  bookImageUrl: z.string().nullable(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  locationLabel: z.string(),
  state: sessionStateSchema,
  visibility: z.enum(["HOST_ONLY", "MEMBER", "PUBLIC"]),
  accessScope: z.enum(["HOST_ONLY", "GUEST_READABLE"]).optional(),
  siteVisibility: z.enum(["HIDDEN", "PUBLIC_RECORD"]).optional(),
  recordStatus: z.enum(["NOT_STARTED", "INCOMPLETE", "COMPLETE"]),
  needsAttention: z.boolean(),
  hasDraft: z.boolean(),
  liveRevision: z.number().int().nonnegative(),
  draftRevision: z.number().int().positive().nullable(),
  lastModifiedAt: z.string().nullable(),
}).strict();

const HostSessionListPageSchema = z.object({
  items: z.array(HostSessionListItemSchema),
  nextCursor: z.string().nullable(),
  summary: z.object({
    needsAttentionCount: z.number().int().nonnegative(),
    incompletePublishedCount: z.number().int().nonnegative(),
    draftCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export function parseHostSessionListPage(value: unknown, mode: HostListMode): HostSessionListPage {
  const page = HostSessionListPageSchema.parse(value);
  const allowedStates = mode === "meeting"
    ? new Set<SessionState>(["DRAFT", "OPEN"])
    : new Set<SessionState>(["CLOSED", "PUBLISHED"]);
  if (page.items.some((item) => !allowedStates.has(item.state))) {
    throw new z.ZodError([{
      code: "custom",
      path: ["items"],
      message: `${mode} 목록에 반대 lifecycle 상태가 포함되었습니다.`,
    }]);
  }
  return page as HostSessionListPage;
}

const HostSessionDeletionCountsSchema = z.object({
  participants: z.number(),
  rsvpResponses: z.number(),
  questions: z.number(),
  checkins: z.number(),
  oneLineReviews: z.number(),
  longReviews: z.number(),
  highlights: z.number(),
  publications: z.number(),
  feedbackReports: z.number(),
  feedbackDocuments: z.number(),
});

export const HostSessionTrashItemSchema = z.object({
  sessionId: z.string(),
  sessionNumber: z.number(),
  title: z.string(),
  state: sessionStateSchema,
  deletedAt: z.string(),
  purgeAfter: z.string(),
  sessionRevision: nonNegativeRevision,
  trashed: z.literal(true).optional(),
  counts: HostSessionDeletionCountsSchema.optional(),
}).strict();

export const HostSessionDeletionResponseSchema = HostSessionTrashItemSchema.extend({
  trashed: z.literal(true),
  counts: HostSessionDeletionCountsSchema,
});

export const HostSessionTrashPageSchema = z.object({
  items: z.array(HostSessionTrashItemSchema),
  nextCursor: z.string().nullable(),
});

export function parseHostSessionTrashItem(value: unknown): HostSessionTrashItem {
  return HostSessionTrashItemSchema.parse(value);
}

export function parseHostSessionTrashPage(value: unknown): HostSessionTrashPage {
  return HostSessionTrashPageSchema.parse(value);
}

export function parseHostSessionDeletionResponse(value: unknown): HostSessionDeletionResponse {
  return HostSessionDeletionResponseSchema.parse(value) as HostSessionDeletionResponse;
}
