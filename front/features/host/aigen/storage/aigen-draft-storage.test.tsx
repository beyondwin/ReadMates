/**
 * Unit tests for the AI generation draft localStorage helpers (spec §10).
 *
 * Manual edits to the PREVIEW snapshot are kept in client state only and
 * persisted under `aigen-draft:{jobId}` so that an accidental reload does
 * not destroy in-progress edits.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionImportV1 } from "@/features/host/aigen/api/aigen-contracts";
import {
  clearAigenDraft,
  draftStorageKey,
  loadAigenDraft,
  saveAigenDraft,
} from "./aigen-draft-storage";

// Node 25 ships an experimental global `localStorage` whose methods are gated
// behind the `--localstorage-file` CLI flag; under vitest+jsdom this Node
// implementation shadows the DOM one and its methods throw "not a function".
// Install a JS-only stand-in on `window` (Storage.prototype) so the helper —
// which itself reaches through `window.localStorage` — works in tests.
function installFakeLocalStorage(): void {
  const data = new Map<string, string>();
  const store: Storage = {
    getItem: (key: string) => (data.has(key) ? data.get(key) ?? null : null),
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: store,
  });
}

function sampleSnapshot(): SessionImportV1 {
  return {
    format: "readmates.session.v1",
    sessionNumber: 3,
    bookTitle: "테스트 책",
    meetingDate: "2026-05-16",
    summary: "요약입니다.",
    highlights: [{ authorName: "독자A", text: "하이라이트" }],
    oneLineReviews: [{ authorName: "독자B", text: "좋아요" }],
    feedbackDocumentFileName: "session-3-feedback.md",
    feedbackDocumentMarkdown: "# 피드백\n\n본문",
  };
}

describe("aigen-draft-storage", () => {
  beforeAll(() => {
    installFakeLocalStorage();
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("derives the key as `aigen-draft:{jobId}`", () => {
    expect(draftStorageKey("job-123")).toBe("aigen-draft:job-123");
  });

  it("saves a snapshot and loads it back", () => {
    const snap = sampleSnapshot();
    saveAigenDraft("job-1", snap);
    expect(loadAigenDraft("job-1")).toEqual(snap);
  });

  it("returns null when no draft is stored", () => {
    expect(loadAigenDraft("missing")).toBeNull();
  });

  it("returns null when the stored value is malformed JSON", () => {
    window.localStorage.setItem("aigen-draft:bad", "{not-json");
    expect(loadAigenDraft("bad")).toBeNull();
  });

  it("clears a previously stored draft", () => {
    saveAigenDraft("job-x", sampleSnapshot());
    clearAigenDraft("job-x");
    expect(loadAigenDraft("job-x")).toBeNull();
  });

  it("does not throw when localStorage.setItem fails (e.g. private browsing)", () => {
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveAigenDraft("job-1", sampleSnapshot())).not.toThrow();
    spy.mockRestore();
  });

  it("returns null when localStorage.getItem throws", () => {
    const spy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(loadAigenDraft("job-1")).toBeNull();
    spy.mockRestore();
  });

  it("does not throw when localStorage.removeItem throws", () => {
    const spy = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => clearAigenDraft("job-1")).not.toThrow();
    spy.mockRestore();
  });
});
