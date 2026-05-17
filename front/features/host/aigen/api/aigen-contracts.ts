/**
 * TypeScript types for the AI session-generation HTTP API (design doc §7).
 *
 * Shapes mirror the server DTOs in
 * `server/.../aigen/adapter/in/web/AiGenerationWebDtos.kt` and
 * `ClubAiDefaultsController.kt`. Enum-like fields are string literal
 * unions matching the server's uppercase Jackson serialization (the
 * server uses `Enum.name` for stage/status/item).
 */

import type { SessionImportCommitResponse } from "@/features/host/api/host-contracts";

export type AiAuthorNameMode = "real" | "alias";

export type AiRecordVisibility = "MEMBER" | "PUBLIC";

export type AiGenerationStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "COMMITTING"
  | "COMMITTED"
  | "FAILED"
  | "CANCELLED";

export type AiGenerationStage =
  | "QUEUED"
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

/** Multipart fields for POST /jobs (spec §7.1). */
export type StartGenerationRequest = {
  transcript: File;
  model?: string;
  authorNameMode: AiAuthorNameMode;
  instructions?: string;
};

/** JSON sub-body for the `body` part of the multipart upload. */
export type StartGenerationBody = {
  model?: string;
  authorNameMode: AiAuthorNameMode;
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
};

export type RegenerateResponse = {
  item: AiGenerationItem;
  value: RegenerateItemValue;
  tokens: AiTokenUsage;
  costEstimateUsd: string;
  warnings: string[];
};

export type CommitGenerationRequest = {
  recordVisibility: AiRecordVisibility;
  /** Optional override sent when the host edited the PREVIEW manually. */
  result?: SessionImportV1;
};

/** Re-exported for callers — commit returns the standard session-import shape. */
export type AiCommitResponse = SessionImportCommitResponse;

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
