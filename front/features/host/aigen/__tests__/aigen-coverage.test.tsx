/**
 * Consolidated coverage index for the AI generation frontend (task_3_6 step 1).
 *
 * Most behaviour is exercised by the co-located unit tests:
 *   - `ui/TranscriptUploadForm.test.tsx` (1 MB rejection, model dropdown)
 *   - `ui/RegenerateModal.test.tsx` (camelCase → UPPER_SNAKE payload)
 *   - `hooks/useAiGenerationJob.test.tsx` (polling cadence, terminal stops)
 *   - `storage/aigen-draft-storage.test.tsx` (save / load / clear)
 *   - `ui/AiGenerateTab.test.tsx` (IDLE → GENERATING → PREVIEW → COMMITTED)
 *
 * This file fills the one residual gap the plan calls out — *draft restoration
 * combined with the PREVIEW state machine* — and provides a meta sanity check
 * for `AIGEN_MODEL_OPTIONS` plus a round-trip integration assertion for the
 * draft helpers. It deliberately does **not** duplicate the focused tests above.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AiGenerationJobResponse,
  ClubAiDefaultResponse,
  SessionImportV1,
  StartGenerationResponse,
} from "@/features/host/aigen/api/aigen-contracts";
import {
  AIGEN_DEFAULT_MODEL,
  AIGEN_MODEL_OPTIONS,
} from "@/features/host/aigen/ui/aigen-model-options";
import {
  clearAigenDraft,
  draftStorageKey,
  loadAigenDraft,
  saveAigenDraft,
} from "@/features/host/aigen/storage/aigen-draft-storage";

vi.mock("@/features/host/aigen/api/aigen-api", () => ({
  startGeneration: vi.fn(),
  getJob: vi.fn(),
  regenerateItem: vi.fn(),
  commitGeneration: vi.fn(),
  cancelGeneration: vi.fn(),
  getClubAiDefault: vi.fn(),
  putClubAiDefault: vi.fn(),
}));

import {
  getClubAiDefault,
  getJob,
  startGeneration,
} from "@/features/host/aigen/api/aigen-api";
import { AiGenerateTab } from "@/features/host/aigen/ui/AiGenerateTab";

const mockedStart = vi.mocked(startGeneration);
const mockedGetJob = vi.mocked(getJob);
const mockedClubDefault = vi.mocked(getClubAiDefault);

// Stable jobId used by the start-response stub so the draft pre-seed matches
// the jobId the tab will eventually adopt.
const PRESEEDED_JOB_ID = "job-with-draft";

function serverSnapshot(): SessionImportV1 {
  return {
    format: "readmates.session.v1",
    sessionNumber: 5,
    bookTitle: "테스트 책",
    meetingDate: "2026-05-16",
    summary: "서버가 생성한 요약",
    highlights: [{ authorName: "독자A", text: "서버 하이라이트" }],
    oneLineReviews: [{ authorName: "독자B", text: "서버 한줄평" }],
    feedbackDocumentFileName: "session-5-feedback.md",
    feedbackDocumentMarkdown: "# 서버 피드백",
  };
}

function jobResponse(): AiGenerationJobResponse {
  return {
    jobId: PRESEEDED_JOB_ID,
    status: "SUCCEEDED",
    stage: null,
    progressPct: 100,
    model: "claude-sonnet-4-6",
    result: serverSnapshot(),
    error: null,
    tokens: null,
    costEstimateUsd: "0.12",
    warnings: [],
  };
}

function clubDefault(): ClubAiDefaultResponse {
  return { defaultModel: "claude-sonnet-4-6" };
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

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
  Object.defineProperty(window, "localStorage", { configurable: true, value: store });
}

describe("AIGEN_MODEL_OPTIONS", () => {
  it("exposes a non-empty, well-formed allowlist with the documented default", () => {
    expect(AIGEN_MODEL_OPTIONS.length).toBeGreaterThan(0);
    for (const option of AIGEN_MODEL_OPTIONS) {
      expect(typeof option.value).toBe("string");
      expect(option.value.length).toBeGreaterThan(0);
      expect(typeof option.label).toBe("string");
      expect(option.label.length).toBeGreaterThan(0);
    }
    const values = AIGEN_MODEL_OPTIONS.map((option) => option.value);
    expect(values).toContain(AIGEN_DEFAULT_MODEL);
    // No duplicate values.
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("aigen draft round-trip", () => {
  beforeEach(() => {
    installFakeLocalStorage();
  });

  it("saves a snapshot, loads it back as deep-equal, and removes it on clear", () => {
    const snap = serverSnapshot();
    expect(loadAigenDraft("rt-1")).toBeNull();
    saveAigenDraft("rt-1", snap);
    expect(window.localStorage.getItem(draftStorageKey("rt-1"))).not.toBeNull();
    expect(loadAigenDraft("rt-1")).toEqual(snap);
    clearAigenDraft("rt-1");
    expect(loadAigenDraft("rt-1")).toBeNull();
  });
});

describe("AiGenerateTab draft restoration (PREVIEW state machine)", () => {
  beforeEach(() => {
    mockedStart.mockReset();
    mockedGetJob.mockReset();
    mockedClubDefault.mockReset();
    mockedClubDefault.mockResolvedValue(clubDefault());
    installFakeLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seeds the PREVIEW snapshot from localStorage draft (not the server result) when a draft exists for the new jobId", async () => {
    // Pre-seed the draft *before* start runs. The draft summary differs from
    // the server result so we can assert which one wins.
    const draft: SessionImportV1 = {
      ...serverSnapshot(),
      summary: "사용자가 편집한 요약",
      highlights: [{ authorName: "독자A", text: "편집된 하이라이트" }],
    };
    saveAigenDraft(PRESEEDED_JOB_ID, draft);

    mockedStart.mockResolvedValue({
      jobId: PRESEEDED_JOB_ID,
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    } satisfies StartGenerationResponse);
    mockedGetJob.mockResolvedValue(jobResponse());

    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} />
      </Wrapper>,
    );

    await screen.findByText("AI로 세션 기록 생성");

    const file = new File(["t"], "transcript.txt", { type: "text/plain" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/대본 파일/), { target: { files: [file] } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /생성 시작/ }));
    });

    // Wait for PREVIEW. Polling cadence is 2s for the first refetch (see
    // useAiGenerationJob), so allow ample headroom for slower CI runners.
    await waitFor(
      () => {
        expect(screen.getByText(/AI가 생성한 기록 미리보기/)).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // The draft summary should win over the server-supplied one.
    expect(screen.getByDisplayValue("사용자가 편집한 요약")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("서버가 생성한 요약")).not.toBeInTheDocument();
  });
});
