import type { ReviewSection, SessionImportV1Snapshot } from "../api/aigen-contracts";
import {
  REVIEW_SECTIONS,
  SECTION_REVIEW_STATES,
  type SectionReviewState,
} from "../model/aigen-review-state";

const KEY_PREFIX = "aigen-draft:";
export const AIGEN_DRAFT_TTL_MS = 6 * 60 * 60 * 1000;
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface AiGenerationDraftEnvelope {
  version: 2;
  jobId: string;
  revision: number;
  serverSnapshot: SessionImportV1Snapshot;
  draft: SessionImportV1Snapshot;
  sectionReviews: Record<ReviewSection, SectionReviewState>;
}

type StoredAiGenerationDraftEnvelope = AiGenerationDraftEnvelope & {
  savedAtEpochMs: number;
};

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
  const key = draftStorageKey(envelope.jobId);
  const previous = readStoredEnvelope(store, key);
  if (previous && isExpired(previous)) {
    removeStoredDraft(store, key);
    return false;
  }
  const savedAtEpochMs =
    previous && previous.jobId === envelope.jobId && previous.revision === envelope.revision
      ? previous.savedAtEpochMs
      : Date.now();
  const safe: StoredAiGenerationDraftEnvelope = {
    version: 2,
    jobId: envelope.jobId,
    revision: envelope.revision,
    // This is the fixed retention anchor for the server revision. Autosave
    // must never slide private generated/member content beyond six hours.
    savedAtEpochMs,
    serverSnapshot: safeSnapshot(envelope.serverSnapshot),
    draft: safeSnapshot(envelope.draft),
    sectionReviews: { ...envelope.sectionReviews },
  };
  try {
    store.setItem(key, JSON.stringify(safe));
    scheduleExpiry(store, key, savedAtEpochMs + AIGEN_DRAFT_TTL_MS);
    return true;
  } catch {
    return false;
  }
}

function clearExpiryTimer(key: string): void {
  const timer = expiryTimers.get(key);
  if (timer !== undefined) clearTimeout(timer);
  expiryTimers.delete(key);
}

function removeStoredDraft(store: Storage, key: string): void {
  clearExpiryTimer(key);
  try {
    store.removeItem(key);
  } catch {
    // Cleanup is best effort; no content is copied elsewhere.
  }
}

function scheduleExpiry(store: Storage, key: string, expiresAtEpochMs: number): void {
  clearExpiryTimer(key);
  const delay = Math.max(0, expiresAtEpochMs - Date.now());
  const timer = setTimeout(() => {
    expiryTimers.delete(key);
    try {
      store.removeItem(key);
    } catch {
      // Cleanup is best effort; no content is copied elsewhere.
    }
  }, delay);
  expiryTimers.set(key, timer);
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

function isEnvelope(value: unknown): value is StoredAiGenerationDraftEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AiGenerationDraftEnvelope>;
  return (
    candidate.version === 2 &&
    typeof candidate.jobId === "string" &&
    typeof (candidate as Partial<StoredAiGenerationDraftEnvelope>).savedAtEpochMs === "number" &&
    Number.isSafeInteger((candidate as Partial<StoredAiGenerationDraftEnvelope>).savedAtEpochMs) &&
    typeof candidate.revision === "number" &&
    Number.isSafeInteger(candidate.revision) &&
    isSnapshot(candidate.serverSnapshot) &&
    isSnapshot(candidate.draft) &&
    Boolean(candidate.sectionReviews) &&
    !Array.isArray(candidate.sectionReviews) &&
    Object.keys(candidate.sectionReviews as object).length === REVIEW_SECTIONS.length &&
    REVIEW_SECTIONS.every((section) =>
      SECTION_REVIEW_STATES.includes(candidate.sectionReviews?.[section] as SectionReviewState),
    )
  );
}

function isExpired(envelope: StoredAiGenerationDraftEnvelope, now = Date.now()): boolean {
  return now - envelope.savedAtEpochMs >= AIGEN_DRAFT_TTL_MS || envelope.savedAtEpochMs > now;
}

function publicEnvelope(envelope: StoredAiGenerationDraftEnvelope): AiGenerationDraftEnvelope {
  return {
    version: envelope.version,
    jobId: envelope.jobId,
    revision: envelope.revision,
    serverSnapshot: envelope.serverSnapshot,
    draft: envelope.draft,
    sectionReviews: envelope.sectionReviews,
  };
}

function readStoredEnvelope(store: Storage, key: string): StoredAiGenerationDraftEnvelope | null {
  try {
    const raw = store.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return isEnvelope(value) ? value : null;
  } catch {
    return null;
  }
}

export function purgeAigenDrafts(activeJobId?: string): void {
  const store = storage();
  if (!store) return;
  const keys = Array.from({ length: store.length }, (_, index) => store.key(index))
    .filter((key): key is string => key?.startsWith(KEY_PREFIX) === true);
  for (const key of keys) {
    const envelope = readStoredEnvelope(store, key);
    const keyJobId = key.slice(KEY_PREFIX.length);
    if (
      !envelope ||
      envelope.jobId !== keyJobId ||
      isExpired(envelope) ||
      (activeJobId !== undefined && envelope.jobId !== activeJobId)
    ) {
      removeStoredDraft(store, key);
    }
  }
}

export function loadAigenDraft(jobId: string, revision: number): AiGenerationDraftEnvelope | null {
  const store = storage();
  if (!store) return null;
  purgeAigenDrafts();
  const value = readStoredEnvelope(store, draftStorageKey(jobId));
  if (!value || value.jobId !== jobId) {
    clearAigenDraft(jobId);
    return null;
  }
  if (value.revision < revision) {
    clearAigenDraft(jobId);
    return null;
  }
  if (value.revision > revision) return null;
  return publicEnvelope(value);
}

export function clearAigenDraft(jobId: string): void {
  const store = storage();
  if (!store) return;
  removeStoredDraft(store, draftStorageKey(jobId));
}
