import { z } from "zod";
import type { SessionState } from "@/shared/model/readmates-types";
import type { PageRequest, PagedResponse } from "@/shared/model/paging";

export type NotificationDecision = "SEND" | "SKIP";
export type SessionRecordStatus = "NOT_STARTED" | "INCOMPLETE" | "COMPLETE";
export type SessionRecordSource = "BASELINE" | "MANUAL" | "JSON_IMPORT" | "AI_GENERATED" | "RESTORED";
export type SessionRecordDraftSource = Exclude<SessionRecordSource, "BASELINE">;
export type SessionRecordVisibility = "HOST_ONLY" | "MEMBER" | "PUBLIC";
export type HostSessionHistoryType =
  | "BASIC_INFO_UPDATED"
  | "ATTENDANCE_UPDATED"
  | "RECORD_REVISION_APPLIED"
  | "RECORD_REVISION_RESTORED"
  | "NOTIFICATION_SENT"
  | "NOTIFICATION_SKIPPED";

export type SessionRecordEntry = {
  membershipId: string;
  authorDisplayName: string;
  text: string;
};

export type SessionRecordFeedbackDocument = {
  fileName: string;
  title: string;
  markdown: string;
};

export type SessionRecordSnapshot = {
  schema: string;
  visibility: SessionRecordVisibility;
  publicationSummary: string;
  highlights: SessionRecordEntry[];
  oneLineReviews: SessionRecordEntry[];
  feedbackDocument: SessionRecordFeedbackDocument;
};

export type HostSessionRecordDraft = {
  sessionId: string;
  baseLiveRevision: number;
  draftRevision: number;
  source: SessionRecordDraftSource;
  restoredFromRevisionId: string | null;
  snapshot: SessionRecordSnapshot;
  updatedAt: string;
};

export type HostSessionRecordEditor = {
  sessionId: string;
  liveRevision: number;
  liveSnapshot: SessionRecordSnapshot;
  draft: HostSessionRecordDraft | null;
  draftLiveBaseStale: boolean;
  validationSummary: {
    valid: boolean;
    issues: string[];
  };
};

export type SaveHostSessionRecordDraftRequest = {
  expectedDraftRevision: number | null;
  snapshot: SessionRecordSnapshot;
};

export type PreviewHostSessionRecordApplyRequest = {
  expectedDraftRevision: number;
  expectedLiveRevision: number;
};

export type HostSessionRecordApplyRequest = {
  previewId: string;
  expectedDraftRevision: number;
  expectedLiveRevision: number;
  notificationDecision: NotificationDecision;
};

export type HostSessionRecordApplyPreview = {
  previewId: string;
  eventType: "FEEDBACK_DOCUMENT_PUBLISHED" | "SESSION_RECORD_UPDATED";
  targetCount: number;
  expectedInAppCount: number;
  expectedEmailCount: number;
  excludedCount: number;
  expiresAt: string;
};

export type HostSessionRecordApplyResult = {
  revisionId: string;
  liveRevision: number;
  decisionId: string;
  notificationDecision: NotificationDecision;
  eventId: string | null;
};

export type RestoreHostSessionRecordDraftRequest = {
  expectedDraftRevision: number | null;
};

export type HostSessionHistoryAttendanceTransition = {
  membershipId: string;
  from: string;
  to: string;
};

export type HostSessionHistoryItem = {
  id: string;
  type: HostSessionHistoryType;
  createdAt: string;
  actorMembershipId: string;
  changedFields: string[];
  attendanceTransitions: HostSessionHistoryAttendanceTransition[];
  revisionId: string | null;
  revisionVersion: number | null;
  revisionSource: SessionRecordSource | null;
  restoredFromRevisionId: string | null;
  notificationEventId: string | null;
};

export type HostSessionHistoryPage = PagedResponse<HostSessionHistoryItem>;

export type HostSessionRecordCapabilities = {
  sessionRecordDrafts: boolean;
  hostActionNotificationConfirmationRequired: boolean;
};

export type HostSessionLedgerRequest = {
  search?: string | null;
  state?: SessionState | null;
  recordStatus?: SessionRecordStatus | null;
  needsAttention?: boolean | null;
  page?: PageRequest;
};

const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const nullableString = z.string().nullable();
const SessionRecordVisibilitySchema = z.enum(["HOST_ONLY", "MEMBER", "PUBLIC"]);
const SessionRecordSourceSchema = z.enum(["BASELINE", "MANUAL", "JSON_IMPORT", "AI_GENERATED", "RESTORED"]);
const SessionRecordDraftSourceSchema = z.enum(["MANUAL", "JSON_IMPORT", "AI_GENERATED", "RESTORED"]);
const NotificationDecisionSchema = z.enum(["SEND", "SKIP"]);

export const SessionRecordSnapshotResponseSchema = z.object({
  schema: z.string(),
  visibility: SessionRecordVisibilitySchema,
  publicationSummary: z.string(),
  highlights: z.array(z.object({
    membershipId: z.string(),
    authorDisplayName: z.string(),
    text: z.string(),
  })),
  oneLineReviews: z.array(z.object({
    membershipId: z.string(),
    authorDisplayName: z.string(),
    text: z.string(),
  })),
  feedbackDocument: z.object({
    fileName: z.string(),
    title: z.string(),
    markdown: z.string(),
  }),
});

export const HostSessionRecordDraftResponseSchema = z.object({
  sessionId: z.string(),
  baseLiveRevision: nonNegativeInteger,
  draftRevision: positiveInteger,
  source: SessionRecordDraftSourceSchema,
  restoredFromRevisionId: nullableString,
  snapshot: SessionRecordSnapshotResponseSchema,
  updatedAt: z.string(),
});

export const HostSessionRecordEditorResponseSchema = z.object({
  sessionId: z.string(),
  liveRevision: nonNegativeInteger,
  liveSnapshot: SessionRecordSnapshotResponseSchema,
  draft: HostSessionRecordDraftResponseSchema.nullable(),
  draftLiveBaseStale: z.boolean(),
  validationSummary: z.object({
    valid: z.boolean(),
    issues: z.array(z.string()),
  }),
});

export const HostSessionRecordApplyPreviewResponseSchema = z.object({
  previewId: z.string(),
  eventType: z.enum(["FEEDBACK_DOCUMENT_PUBLISHED", "SESSION_RECORD_UPDATED"]),
  targetCount: nonNegativeInteger,
  expectedInAppCount: nonNegativeInteger,
  expectedEmailCount: nonNegativeInteger,
  excludedCount: nonNegativeInteger,
  expiresAt: z.string(),
});

export const HostSessionRecordApplyResultResponseSchema = z.object({
  revisionId: z.string(),
  liveRevision: positiveInteger,
  decisionId: z.string(),
  notificationDecision: NotificationDecisionSchema,
  eventId: nullableString,
});

export const HostSessionHistoryPageResponseSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    type: z.enum([
      "BASIC_INFO_UPDATED",
      "ATTENDANCE_UPDATED",
      "RECORD_REVISION_APPLIED",
      "RECORD_REVISION_RESTORED",
      "NOTIFICATION_SENT",
      "NOTIFICATION_SKIPPED",
    ]),
    createdAt: z.string(),
    actorMembershipId: z.string(),
    changedFields: z.array(z.string()),
    attendanceTransitions: z.array(z.object({
      membershipId: z.string(),
      from: z.string(),
      to: z.string(),
    })),
    revisionId: nullableString,
    revisionVersion: nonNegativeInteger.nullable(),
    revisionSource: SessionRecordSourceSchema.nullable(),
    restoredFromRevisionId: nullableString,
    notificationEventId: nullableString,
  })),
  nextCursor: nullableString,
});

export const HostSessionRecordCapabilitiesResponseSchema = z.object({
  sessionRecordDrafts: z.boolean(),
  hostActionNotificationConfirmationRequired: z.boolean(),
});

export const HostSessionRecordLedgerPageResponseSchema = z.object({
  items: z.array(z.object({
    sessionId: z.string(),
    sessionNumber: nonNegativeInteger,
    title: z.string(),
    bookTitle: z.string(),
    bookAuthor: z.string(),
    bookImageUrl: nullableString,
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    locationLabel: z.string(),
    state: z.enum(["DRAFT", "OPEN", "PUBLISHED", "CLOSED"]),
    visibility: SessionRecordVisibilitySchema,
    recordStatus: z.enum(["NOT_STARTED", "INCOMPLETE", "COMPLETE"]),
    needsAttention: z.boolean(),
    hasDraft: z.boolean(),
    liveRevision: nonNegativeInteger,
    draftRevision: positiveInteger.nullable(),
    lastModifiedAt: nullableString,
  })),
  nextCursor: nullableString,
});

export function parseHostSessionRecordEditor(value: unknown): HostSessionRecordEditor {
  return HostSessionRecordEditorResponseSchema.parse(value) as HostSessionRecordEditor;
}

export function parseHostSessionRecordDraft(value: unknown): HostSessionRecordDraft {
  return HostSessionRecordDraftResponseSchema.parse(value) as HostSessionRecordDraft;
}

export function parseHostSessionRecordApplyPreview(value: unknown): HostSessionRecordApplyPreview {
  return HostSessionRecordApplyPreviewResponseSchema.parse(value) as HostSessionRecordApplyPreview;
}

export function parseHostSessionRecordApplyResult(value: unknown): HostSessionRecordApplyResult {
  return HostSessionRecordApplyResultResponseSchema.parse(value) as HostSessionRecordApplyResult;
}

export function parseHostSessionHistoryPage(value: unknown): HostSessionHistoryPage {
  return HostSessionHistoryPageResponseSchema.parse(value) as HostSessionHistoryPage;
}

export function parseHostSessionRecordCapabilities(value: unknown): HostSessionRecordCapabilities {
  return HostSessionRecordCapabilitiesResponseSchema.parse(value) as HostSessionRecordCapabilities;
}
