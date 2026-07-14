/**
 * TypeScript types for the AI session-generation HTTP API (design doc §7).
 *
 * Shapes mirror the server DTOs in
 * `server/.../aigen/adapter/in/web/AiGenerationWebDtos.kt` and
 * `ClubAiDefaultsController.kt`. Enum-like fields are string literal
 * unions matching the server's uppercase Jackson serialization (the
 * server uses `Enum.name` for stage/status/item).
 */

export type AiRecordVisibility = "MEMBER" | "PUBLIC";

export type AiGenerationStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "COMMITTING"
  | "COMMIT_RETRY"
  | "COMMITTED"
  | "FAILED"
  | "CANCELLED";

export type AiGenerationStage =
  | "QUEUED"
  | "PREPARING_TRANSCRIPT"
  | "GENERATING_RECORD"
  | "VALIDATING_GROUNDING"
  | "REPAIRING_RECORD"
  | "TRANSCRIPT_LOADED"
  | "GENERATING_SUMMARY"
  | "GENERATING_HIGHLIGHTS"
  | "GENERATING_ONE_LINE_REVIEWS"
  | "GENERATING_FEEDBACK_DOCUMENT"
  | "VALIDATING"
  | "READY";

export type AiGenerationItem =
  | "summary"
  | "highlights"
  | "oneLineReviews"
  | "feedbackDocument";

export type AiTokenUsage = {
  input: number;
  cachedInput: number;
  output: number;
};

export type AiGenerationError = {
  code: string;
  message: string;
};

/**
 * Authored block (highlight / one-line review) in the session-import payload.
 */
export type SessionImportAuthoredText = {
  authorName: string;
  text: string;
};

/**
 * Server-side `SessionImportV1Json` — the validated session payload the
 * AI orchestrator produces and the commit endpoint accepts as override.
 *
 * Fields are flat (not nested under `session`/`publication`) because
 * the Kotlin DTO emits them at the top level.
 */
export type SessionImportV1 = {
  format: string;
  sessionNumber: number;
  bookTitle: string;
  /** ISO local date, `yyyy-MM-dd`. */
  meetingDate: string;
  summary: string;
  highlights: SessionImportAuthoredText[];
  oneLineReviews: SessionImportAuthoredText[];
  feedbackDocumentFileName: string;
  feedbackDocumentMarkdown: string;
};

export type SessionImportV1Snapshot = SessionImportV1;

export type AiGenerationErrorCode =
  | "TRANSCRIPT_SPEAKER_NOT_MEMBER"
  | "TRANSCRIPT_SPEAKER_AMBIGUOUS"
  | "TRANSCRIPT_FORMAT_INVALID"
  | "TRANSCRIPT_EMPTY"
  | "TRANSCRIPT_DURATION_EXCEEDED"
  | "TRANSCRIPT_TOO_LONG_FOR_MODEL"
  | "TRANSCRIPT_ALIAS_MODE_UNSUPPORTED"
  | "MODEL_CAPABILITY_UNAVAILABLE"
  | "STALE_GENERATION_REVISION"
  | "MEMBERSHIP_CHANGED"
  | "JOB_EXPIRED"
  | (string & {});

export interface AiGenerationProblem {
  code: AiGenerationErrorCode;
  detail: string;
  invalidSpeakerLabels?: string[];
  currentRevision?: number;
}

export type ReviewSection =
  | "SUMMARY"
  | "HIGHLIGHTS"
  | "ONE_LINE_REVIEWS"
  | "FEEDBACK_DOCUMENT";

export type ServerSectionReviewStatus =
  | "AI_GROUNDED_REVIEWED"
  | "USER_EDITED_CONFIRMED";

export type GroundingStatus = "PENDING" | "VALID" | "INVALID";

export type AiEvidenceExcerpt = {
  section: ReviewSection;
  targetId: string;
  ordinal: number;
  turnId: string;
  startSeconds: number;
  speakerName: string;
  excerpt: string;
  truncated: boolean;
};

export type ExpandedEvidenceTurn = {
  turnId: string;
  speakerName: string;
  startSeconds: number;
  text: string;
};

export type AvailableGenerationModel = {
  id: string;
  provider: string;
  isDefault: boolean;
};

export type AvailableGenerationModelsResponse = {
  models: AvailableGenerationModel[];
};

/** Multipart fields for POST /jobs (spec §7.1). */
export type StartGenerationRequest = {
  transcript: File;
  model?: string;
  instructions?: string;
};

/** JSON sub-body for the `body` part of the multipart upload. */
export type StartGenerationBody = {
  model?: string;
  instructions?: string;
};

export type StartGenerationResponse = {
  jobId: string;
  status: AiGenerationStatus;
  /** ISO instant, UTC. */
  expiresAt: string;
};

export type AiGenerationJobResponse = {
  jobId: string;
  status: AiGenerationStatus;
  stage: AiGenerationStage | null;
  progressPct: number;
  model: string;
  result: SessionImportV1 | null;
  error: AiGenerationError | null;
  tokens: AiTokenUsage | null;
  /** Decimal string (server uses BigDecimal.toPlainString). */
  costEstimateUsd: string;
  warnings: string[];
  expiresAt?: string;
  createdAt?: string;
  lastUpdatedAt?: string;
  revision?: number | null;
  groundingStatus?: GroundingStatus | null;
  evidence?: AiEvidenceExcerpt[] | null;
  sectionReviewStatuses?: Partial<Record<ReviewSection, string>> | null;
};

export type AiGenerationAvailableAction =
  | "POLL"
  | "CANCEL"
  | "COMMIT_RETRY"
  | "START_NEW";

export type AiRecentJobResponse = {
  jobId: string;
  status: AiGenerationStatus;
  stage: AiGenerationStage | null;
  progressPct: number;
  model: string;
  error: AiGenerationError | null;
  /** Decimal string (server uses BigDecimal.toPlainString). */
  costEstimateUsd: string;
  /** ISO instant, UTC. */
  createdAt: string;
  /** ISO instant, UTC. */
  lastUpdatedAt: string;
  /** ISO instant, UTC. */
  expiresAt: string;
  availableActions: AiGenerationAvailableAction[];
};

/** Item-specific shape of the regenerate response `value`. */
export type RegenerateItemValue =
  | { summary: string }
  | { highlights: SessionImportAuthoredText[] }
  | { oneLineReviews: SessionImportAuthoredText[] }
  | { feedbackDocumentFileName: string; feedbackDocumentMarkdown: string };

export type RegenerateRequest = {
  item: AiGenerationItem;
  model?: string;
  instructions?: string;
  expectedRevision?: number;
};

export type RegenerateResponse = {
  item: AiGenerationItem;
  value: RegenerateItemValue;
  tokens: AiTokenUsage;
  costEstimateUsd: string;
  warnings: string[];
  revision?: number | null;
  result?: SessionImportV1 | null;
  evidence?: AiEvidenceExcerpt[] | null;
  sectionReviewStatuses?: Partial<Record<ReviewSection, string>> | null;
};

export type CommitGenerationRequest = {
  recordVisibility: AiRecordVisibility;
  /** Optional override sent when the host edited the PREVIEW manually. */
  result?: SessionImportV1;
  expectedRevision?: number;
  sectionReviews?: Record<ReviewSection, ServerSectionReviewStatus>;
};

/** Content-free commit receipt. It deliberately contains no generated content. */
export type AiCommitResponse = {
  sessionId: string;
  status: "COMMITTED";
  recovered: boolean;
  participantUpdatesCount: number | null;
};

export type ClubAiDefaultResponse = {
  defaultModel: string | null;
};

export type ClubAiDefaultRequest = {
  defaultModel: string;
};

/** RFC 7807 problem detail used by the AI generation error handler. */
export type AiProblemDetail = {
  type: string;
  title: string;
  status: number;
  detail: string | null;
  code: string;
};
