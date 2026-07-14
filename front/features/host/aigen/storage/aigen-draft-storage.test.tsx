import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewSection, SessionImportV1 } from "../api/aigen-contracts";
import type { SectionReviewState } from "../model/aigen-review-state";
import {
  clearAigenDraft,
  draftStorageKey,
  loadAigenDraft,
  saveAigenDraft,
  type AiGenerationDraftEnvelope,
} from "./aigen-draft-storage";

function installFakeLocalStorage(): void {
  const data = new Map<string, string>();
  const store: Storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() { return data.size; },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: store });
}

function snapshot(summary = "합성 요약"): SessionImportV1 {
  return {
    format: "readmates-session-import:v1",
    sessionNumber: 3,
    bookTitle: "공개 테스트 책",
    meetingDate: "2026-07-14",
    summary,
    highlights: [{ authorName: "공개 회원", text: "합성 하이라이트" }],
    oneLineReviews: [{ authorName: "다른 회원", text: "합성 한줄평" }],
    feedbackDocumentFileName: "session-3-feedback.md",
    feedbackDocumentMarkdown: "# 합성 피드백",
  };
}

const pending: Record<ReviewSection, SectionReviewState> = {
  SUMMARY: "PENDING",
  HIGHLIGHTS: "PENDING",
  ONE_LINE_REVIEWS: "PENDING",
  FEEDBACK_DOCUMENT: "PENDING",
};

function envelope(): AiGenerationDraftEnvelope {
  return {
    version: 2,
    jobId: "job-1",
    revision: 4,
    serverSnapshot: snapshot(),
    draft: snapshot("사용자 수정 요약"),
    sectionReviews: pending,
  };
}

describe("aigen-draft-storage v2", () => {
  beforeAll(installFakeLocalStorage);
  beforeEach(() => window.localStorage.clear());
  afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

  it("stores only the versioned browser review envelope", () => {
    expect(saveAigenDraft(envelope())).toBe(true);
    expect(loadAigenDraft("job-1", 4)).toEqual(envelope());
    const raw = window.localStorage.getItem(draftStorageKey("job-1")) ?? "";
    expect(raw).not.toContain("evidence");
    expect(raw).not.toContain("turnId");
    expect(raw).not.toContain("transcript");
  });

  it("discards another job or revision instead of restoring stale review state", () => {
    saveAigenDraft(envelope());
    expect(loadAigenDraft("job-1", 5)).toBeNull();
    expect(window.localStorage.getItem(draftStorageKey("job-1"))).toBeNull();
  });

  it("rejects malformed and legacy unversioned data", () => {
    window.localStorage.setItem(draftStorageKey("bad"), "{bad-json");
    expect(loadAigenDraft("bad", 1)).toBeNull();
    window.localStorage.setItem(draftStorageKey("legacy"), JSON.stringify(snapshot()));
    expect(loadAigenDraft("legacy", 1)).toBeNull();
  });

  it("returns false on storage failure so the UI can warn without losing memory state", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(saveAigenDraft(envelope())).toBe(false);
  });

  it("clears best-effort", () => {
    saveAigenDraft(envelope());
    clearAigenDraft("job-1");
    expect(loadAigenDraft("job-1", 4)).toBeNull();
  });
});
