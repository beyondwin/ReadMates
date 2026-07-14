import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AiGenerationJobResponse,
  SessionImportV1,
  StartGenerationResponse,
} from "@/features/host/aigen/api/aigen-contracts";
import { saveAigenDraft } from "@/features/host/aigen/storage/aigen-draft-storage";

vi.mock("@/features/host/aigen/api/aigen-api", () => ({
  startGeneration: vi.fn(),
  getJob: vi.fn(),
  getRecentJob: vi.fn(),
  regenerateItem: vi.fn(),
  commitGeneration: vi.fn(),
  cancelGeneration: vi.fn(),
  getAvailableModels: vi.fn(),
  putClubAiDefault: vi.fn(),
}));

import {
  getAvailableModels,
  getJob,
  getRecentJob,
  startGeneration,
} from "@/features/host/aigen/api/aigen-api";
import { AiGenerateTab } from "@/features/host/aigen/ui/AiGenerateTab";

const mockedStart = vi.mocked(startGeneration);
const mockedGetJob = vi.mocked(getJob);
const mockedGetRecent = vi.mocked(getRecentJob);
const mockedModels = vi.mocked(getAvailableModels);

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

describe("AiGenerateTab draft restoration (PREVIEW state machine)", () => {
  beforeEach(() => {
    mockedStart.mockReset();
    mockedGetJob.mockReset();
    mockedGetRecent.mockReset();
    mockedModels.mockReset();
    mockedModels.mockResolvedValue({
      models: [{ id: "claude-sonnet-4-6", provider: "CLAUDE", isDefault: true }],
    });
    mockedGetRecent.mockResolvedValue(null);
    installFakeLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seeds the PREVIEW snapshot from localStorage draft (not the server result) when a draft exists for the new jobId", async () => {
    const draft: SessionImportV1 = {
      ...serverSnapshot(),
      summary: "사용자가 편집한 요약",
      highlights: [{ authorName: "독자A", text: "편집된 하이라이트" }],
    };
    saveAigenDraft({
      version: 2,
      jobId: PRESEEDED_JOB_ID,
      revision: 0,
      serverSnapshot: serverSnapshot(),
      draft,
      sectionReviews: {
        SUMMARY: "PENDING",
        HIGHLIGHTS: "PENDING",
        ONE_LINE_REVIEWS: "PENDING",
        FEEDBACK_DOCUMENT: "PENDING",
      },
    });

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
    const submit = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(
      () => {
        expect(screen.getByText(/AI가 생성한 기록 미리보기/)).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    expect(screen.getByDisplayValue("사용자가 편집한 요약")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("서버가 생성한 요약")).not.toBeInTheDocument();
  });
});
