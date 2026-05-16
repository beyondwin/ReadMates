/**
 * localStorage-backed draft storage for the AI generation PREVIEW (spec §10).
 *
 * Manual edits to the snapshot are kept in client state only; this helper
 * mirrors the snapshot under `aigen-draft:{jobId}` so a reload does not
 * destroy in-progress edits. The parent component is expected to call
 * `clearAigenDraft` on commit or cancel.
 *
 * All access is wrapped in try/catch — private browsing modes, disabled
 * storage, and quota errors are tolerated by silently dropping the write
 * or returning `null` on read.
 */

import type { SessionImportV1 } from "@/features/host/aigen/api/aigen-contracts";

const KEY_PREFIX = "aigen-draft:";

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

export function saveAigenDraft(jobId: string, snapshot: SessionImportV1): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(draftStorageKey(jobId), JSON.stringify(snapshot));
  } catch {
    // Quota exceeded, private mode, etc. — drop the write silently.
  }
}

export function loadAigenDraft(jobId: string): SessionImportV1 | null {
  const store = storage();
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(draftStorageKey(jobId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as SessionImportV1;
  } catch {
    return null;
  }
}

export function clearAigenDraft(jobId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(draftStorageKey(jobId));
  } catch {
    // Tolerate failure — best-effort cleanup.
  }
}
