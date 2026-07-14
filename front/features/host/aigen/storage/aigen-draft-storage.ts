import type { ReviewSection, SessionImportV1Snapshot } from "../api/aigen-contracts";
import type { SectionReviewState } from "../model/aigen-review-state";

const KEY_PREFIX = "aigen-draft:";
const REVIEW_SECTIONS: ReviewSection[] = [
  "SUMMARY", "HIGHLIGHTS", "ONE_LINE_REVIEWS", "FEEDBACK_DOCUMENT",
];
const REVIEW_STATES: SectionReviewState[] = [
  "PENDING", "AI_GROUNDED_REVIEWED", "USER_EDITED_REVIEW_REQUIRED", "USER_EDITED_CONFIRMED",
];

export interface AiGenerationDraftEnvelope {
  version: 2;
  jobId: string;
  revision: number;
  serverSnapshot: SessionImportV1Snapshot;
  draft: SessionImportV1Snapshot;
  sectionReviews: Record<ReviewSection, SectionReviewState>;
}

export function draftStorageKey(jobId: string): string {
  return `${KEY_PREFIX}${jobId}`;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function safeSnapshot(snapshot: SessionImportV1Snapshot): SessionImportV1Snapshot {
  return {
    format: snapshot.format,
    sessionNumber: snapshot.sessionNumber,
    bookTitle: snapshot.bookTitle,
    meetingDate: snapshot.meetingDate,
    summary: snapshot.summary,
    highlights: snapshot.highlights.map(({ authorName, text }) => ({ authorName, text })),
    oneLineReviews: snapshot.oneLineReviews.map(({ authorName, text }) => ({ authorName, text })),
    feedbackDocumentFileName: snapshot.feedbackDocumentFileName,
    feedbackDocumentMarkdown: snapshot.feedbackDocumentMarkdown,
  };
}

export function saveAigenDraft(envelope: AiGenerationDraftEnvelope): boolean {
  const store = storage();
  if (!store) return false;
  const safe: AiGenerationDraftEnvelope = {
    version: 2,
    jobId: envelope.jobId,
    revision: envelope.revision,
    serverSnapshot: safeSnapshot(envelope.serverSnapshot),
    draft: safeSnapshot(envelope.draft),
    sectionReviews: { ...envelope.sectionReviews },
  };
  try {
    store.setItem(draftStorageKey(envelope.jobId), JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

function isSnapshot(value: unknown): value is SessionImportV1Snapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SessionImportV1Snapshot>;
  return (
    typeof candidate.format === "string" &&
    typeof candidate.sessionNumber === "number" &&
    Number.isSafeInteger(candidate.sessionNumber) &&
    candidate.sessionNumber > 0 &&
    typeof candidate.bookTitle === "string" &&
    typeof candidate.meetingDate === "string" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.highlights) &&
    candidate.highlights.every(isAuthoredText) &&
    Array.isArray(candidate.oneLineReviews) &&
    candidate.oneLineReviews.every(isAuthoredText) &&
    typeof candidate.feedbackDocumentFileName === "string" &&
    typeof candidate.feedbackDocumentMarkdown === "string"
  );
}

function isAuthoredText(value: unknown): value is { authorName: string; text: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { authorName?: unknown; text?: unknown };
  return typeof candidate.authorName === "string" && typeof candidate.text === "string";
}

function isEnvelope(value: unknown): value is AiGenerationDraftEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AiGenerationDraftEnvelope>;
  return (
    candidate.version === 2 &&
    typeof candidate.jobId === "string" &&
    typeof candidate.revision === "number" &&
    Number.isSafeInteger(candidate.revision) &&
    isSnapshot(candidate.serverSnapshot) &&
    isSnapshot(candidate.draft) &&
    Boolean(candidate.sectionReviews) &&
    !Array.isArray(candidate.sectionReviews) &&
    Object.keys(candidate.sectionReviews as object).length === REVIEW_SECTIONS.length &&
    REVIEW_SECTIONS.every((section) =>
      REVIEW_STATES.includes(candidate.sectionReviews?.[section] as SectionReviewState),
    )
  );
}

export function loadAigenDraft(jobId: string, revision: number): AiGenerationDraftEnvelope | null {
  const store = storage();
  if (!store) return null;
  let value: unknown;
  try {
    const raw = store.getItem(draftStorageKey(jobId));
    if (raw === null) return null;
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isEnvelope(value) || value.jobId !== jobId) {
    clearAigenDraft(jobId);
    return null;
  }
  if (value.revision !== revision) return null;
  return value;
}

export function clearAigenDraft(jobId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(draftStorageKey(jobId));
  } catch {
    // Cleanup is best effort; no content is copied elsewhere.
  }
}
