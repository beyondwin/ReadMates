/**
 * State-machine tests for AiGenerateTab (design doc §10).
 *
 * The tab transitions IDLE → GENERATING → (PREVIEW | ERROR | IDLE) →
 * COMMITTED. The polling, API calls, and snapshot patching are mocked at
 * the aigen-api boundary; only the tab's transition logic is exercised.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AiGenerationJobResponse,
  AiGenerationStatus,
  SessionImportV1,
  StartGenerationResponse,
} from "@/features/host/aigen/api/aigen-contracts";

vi.mock("@/features/host/aigen/api/aigen-api", () => ({
  AiGenerationApiError: class AiGenerationApiError extends Error {
    constructor(readonly status: number, readonly problem: { code: string; detail: string; invalidSpeakerLabels?: string[] }) {
      super(problem.detail);
    }
  },
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
  cancelGeneration,
  commitGeneration,
  AiGenerationApiError,
  getAvailableModels,
  getJob,
  getRecentJob,
  regenerateItem,
  startGeneration,
} from "@/features/host/aigen/api/aigen-api";
import { AiGenerateTab } from "./AiGenerateTab";

const mockedStart = vi.mocked(startGeneration);
const mockedGetJob = vi.mocked(getJob);
const mockedGetRecent = vi.mocked(getRecentJob);
const mockedCommit = vi.mocked(commitGeneration);
const mockedCancel = vi.mocked(cancelGeneration);
const mockedRegenerate = vi.mocked(regenerateItem);
const mockedModels = vi.mocked(getAvailableModels);

function sampleSnapshot(): SessionImportV1 {
  return {
    format: "readmates.session.v1",
    sessionNumber: 5,
    bookTitle: "테스트",
    meetingDate: "2026-05-16",
    summary: "요약",
    highlights: [{ authorName: "A", text: "h1" }],
    oneLineReviews: [{ authorName: "B", text: "r1" }],
    feedbackDocumentFileName: "session-5-feedback.md",
    feedbackDocumentMarkdown: "# 피드백",
  };
}

function jobResponse(status: AiGenerationStatus, opts: Partial<AiGenerationJobResponse> = {}): AiGenerationJobResponse {
  return {
    jobId: "job-1",
    status,
    stage: status === "RUNNING" ? "GENERATING_SUMMARY" : null,
    progressPct: status === "SUCCEEDED" ? 100 : 50,
    model: "claude-sonnet-4-6",
    result: status === "SUCCEEDED" ? sampleSnapshot() : null,
    error: null,
    tokens: null,
    costEstimateUsd: "0.12",
    warnings: [],
    ...opts,
  };
}

function groundedJob(): AiGenerationJobResponse {
  return jobResponse("SUCCEEDED", {
    revision: 3,
    groundingStatus: "VALID",
    evidence: [
      { section: "SUMMARY", targetId: "r3:SUMMARY:0", ordinal: 0, turnId: "turn-1", startSeconds: 0, speakerName: "공개 회원", excerpt: "합성 근거", truncated: false },
      { section: "HIGHLIGHTS", targetId: "r3:HIGHLIGHTS:0", ordinal: 0, turnId: "turn-1", startSeconds: 0, speakerName: "공개 회원", excerpt: "합성 근거", truncated: false },
      { section: "ONE_LINE_REVIEWS", targetId: "r3:ONE_LINE_REVIEWS:0", ordinal: 0, turnId: "turn-1", startSeconds: 0, speakerName: "공개 회원", excerpt: "합성 근거", truncated: false },
      { section: "FEEDBACK_DOCUMENT", targetId: "r3:FEEDBACK_DOCUMENT:0", ordinal: 0, turnId: "turn-1", startSeconds: 0, speakerName: "공개 회원", excerpt: "합성 근거", truncated: false },
    ],
    sectionReviewStatuses: {
      SUMMARY: "PENDING_REVIEW",
      HIGHLIGHTS: "PENDING_REVIEW",
      ONE_LINE_REVIEWS: "PENDING_REVIEW",
      FEEDBACK_DOCUMENT: "PENDING_REVIEW",
    },
  });
}

function recentJobResponse(status: AiGenerationStatus): import("@/features/host/aigen/api/aigen-contracts").AiRecentJobResponse {
  return {
    ...jobResponse(status),
    createdAt: "2026-05-18T00:00:00Z",
    lastUpdatedAt: "2026-05-18T00:01:00Z",
    expiresAt: "2026-05-18T06:00:00Z",
    availableActions: ["POLL", "CANCEL", "COMMIT_RETRY"],
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

describe("AiGenerateTab", () => {
  beforeEach(() => {
    mockedStart.mockReset();
    mockedGetJob.mockReset();
    mockedGetRecent.mockReset();
    mockedCommit.mockReset();
    mockedCancel.mockReset();
    mockedRegenerate.mockReset();
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

  it("starts in IDLE and shows the TranscriptUploadForm", async () => {
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} />
      </Wrapper>,
    );

    expect(await screen.findByText("AI로 세션 기록 생성")).toBeInTheDocument();
    expect(screen.getByLabelText(/대본 파일/)).toBeInTheDocument();
    expect(mockedModels).toHaveBeenCalledWith("s1");
  });

  it("keeps the upload form mounted and shows safe invalid speaker correction", async () => {
    mockedStart.mockRejectedValue(
      new AiGenerationApiError(422, {
        code: "TRANSCRIPT_SPEAKER_NOT_MEMBER",
        detail: "대본의 화자 이름을 확인해 주세요.",
        invalidSpeakerLabels: ["확인 필요"],
      }),
    );
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} />
      </Wrapper>,
    );

    const file = new File(["확인 필요 00:00\n안녕하세요"], "transcript.txt", {
      type: "text/plain",
    });
    fireEvent.change(await screen.findByLabelText(/대본 파일/), { target: { files: [file] } });
    const submit = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent(/확인 필요/);
    expect(screen.getByLabelText(/대본 파일/)).toBeInTheDocument();
  });

  it("shows COMMIT_RETRY as receipt recovery without exposing preview or cancel", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    });
    mockedGetJob.mockResolvedValue(jobResponse("COMMIT_RETRY", { result: null }));
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} />
      </Wrapper>,
    );

    fireEvent.change(await screen.findByLabelText(/대본 파일/), {
      target: { files: [new File(["회원 00:00\n본문"], "transcript.txt")] },
    });
    const submit = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    expect(await screen.findByText("커밋 확인 중")).toBeInTheDocument();
    expect(screen.queryByText(/AI가 생성한 기록 미리보기/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^취소$/ })).not.toBeInTheDocument();
  });

  it("shows a recent recoverable job on idle render and resumes polling", async () => {
    mockedGetRecent.mockResolvedValue(recentJobResponse("SUCCEEDED"));
    mockedGetJob.mockResolvedValue(jobResponse("SUCCEEDED"));

    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} />
      </Wrapper>,
    );

    expect(await screen.findByText("SUCCEEDED")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Polling 재개" }));
    });

    await waitFor(() => {
      expect(mockedGetJob).toHaveBeenCalledWith("s1", "job-1");
    });
  });

  it("transitions IDLE → GENERATING when start succeeds", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    } satisfies StartGenerationResponse);
    mockedGetJob.mockResolvedValue(jobResponse("RUNNING"));

    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} />
      </Wrapper>,
    );

    // Wait for club default to populate so submit is enabled.
    await screen.findByText("AI로 세션 기록 생성");

    const file = new File(["transcript body"], "transcript.txt", { type: "text/plain" });
    const fileInput = screen.getByLabelText(/대본 파일/) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    const submit = screen.getByRole("button", { name: /생성 시작/ });
    // Wait until the club default query resolves so the button is enabled;
    // otherwise the click races and the start mutation never fires on slower
    // CI runners.
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(mockedStart).toHaveBeenCalledTimes(1);
    });
    // GENERATING state shows the progress bar.
    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });
  });

  it("transitions GENERATING → PREVIEW when poll returns SUCCEEDED", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    });
    mockedGetJob.mockResolvedValue(jobResponse("SUCCEEDED"));

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
    const startButton = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => {
      expect(startButton).toBeEnabled();
    });
    await act(async () => {
      fireEvent.click(startButton);
    });

    // After poll, PREVIEW shows summary section editor.
    await waitFor(() => {
      expect(screen.getByText(/AI가 생성한 기록 미리보기/)).toBeInTheDocument();
    });
  });

  it("transitions GENERATING → ERROR when poll returns FAILED", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    });
    mockedGetJob.mockResolvedValue(
      jobResponse("FAILED", { error: { code: "LLM_TIMEOUT", message: "LLM이 응답하지 않았습니다." } }),
    );

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

    await waitFor(() => {
      expect(screen.getByText(/LLM이 응답하지 않았습니다/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /다시 시도/ })).toBeInTheDocument();
  });

  it("transitions GENERATING → IDLE when poll returns CANCELLED", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    });
    mockedGetJob.mockResolvedValue(jobResponse("CANCELLED"));

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

    // Back to IDLE: TranscriptUploadForm is shown again.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /생성 시작/ })).toBeInTheDocument();
    });
  });

  it("invokes cancelGeneration when the user clicks 취소", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    });
    // Keep returning RUNNING so we stay in GENERATING.
    mockedGetJob.mockResolvedValue(jobResponse("RUNNING"));
    mockedCancel.mockResolvedValue(undefined);

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

    const cancelBtn = await screen.findByRole("button", { name: /^취소$/ });
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    await waitFor(() => {
      expect(mockedCancel).toHaveBeenCalledWith("s1", "job-1");
    });
  });

  it("transitions PREVIEW → COMMITTED and calls onCommitted on successful commit", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    });
    mockedGetJob.mockResolvedValue(jobResponse("SUCCEEDED"));
    mockedCommit.mockResolvedValue({
      sessionId: "s1",
      session: { id: "s1" },
    } as unknown as Awaited<ReturnType<typeof commitGeneration>>);

    const onCommitted = vi.fn();
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={onCommitted} />
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

    const commitBtn = await screen.findByRole("button", { name: /기록 저장/ });
    await act(async () => {
      fireEvent.click(commitBtn);
    });

    await waitFor(() => {
      expect(mockedCommit).toHaveBeenCalledTimes(1);
      expect(onCommitted).toHaveBeenCalledTimes(1);
    });
  });

  it("blocks grounded commit until all four sections are reviewed and sends exact revision reviews", async () => {
    mockedStart.mockResolvedValue({ jobId: "job-1", status: "PENDING", expiresAt: "2026-07-14T12:00:00Z" });
    mockedGetJob.mockResolvedValue(groundedJob());
    mockedCommit.mockResolvedValue({
      sessionId: "s1",
      status: "COMMITTED",
      recovered: false,
      participantUpdatesCount: 2,
    });
    const { Wrapper } = createWrapper();
    render(<Wrapper><AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} /></Wrapper>);

    fireEvent.change(await screen.findByLabelText(/대본 파일/), {
      target: { files: [new File(["공개 회원 00:00\n합성 대화"], "transcript.txt")] },
    });
    const start = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);

    const commit = await screen.findByRole("button", { name: "AI 기록 저장" });
    expect(commit).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: "AI 근거 검토 완료" })) {
      fireEvent.click(button);
    }
    await waitFor(() => expect(commit).toBeEnabled());
    fireEvent.click(commit);

    await waitFor(() => expect(mockedCommit).toHaveBeenCalledTimes(1));
    expect(mockedCommit.mock.calls[0]?.[2]).toMatchObject({
      expectedRevision: 3,
      sectionReviews: {
        SUMMARY: "AI_GROUNDED_REVIEWED",
        HIGHLIGHTS: "AI_GROUNDED_REVIEWED",
        ONE_LINE_REVIEWS: "AI_GROUNDED_REVIEWED",
        FEEDBACK_DOCUMENT: "AI_GROUNDED_REVIEWED",
      },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("참여 상태 2건을 동기화했습니다");
  });

  it("preserves local edits on a stale revision and offers an explicit review reset", async () => {
    mockedStart.mockResolvedValue({ jobId: "job-1", status: "PENDING", expiresAt: "2026-07-14T12:00:00Z" });
    mockedGetJob.mockResolvedValue(groundedJob());
    mockedCommit.mockRejectedValue(
      new AiGenerationApiError(409, {
        code: "STALE_GENERATION_REVISION",
        detail: "최신 revision을 확인해 주세요.",
        currentRevision: 4,
      }),
    );
    const { Wrapper } = createWrapper();
    render(<Wrapper><AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} /></Wrapper>);
    fireEvent.change(await screen.findByLabelText(/대본 파일/), {
      target: { files: [new File(["공개 회원 00:00\n합성 대화"], "transcript.txt")] },
    });
    const start = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    const summary = await screen.findByLabelText("요약");
    fireEvent.change(summary, { target: { value: "호스트가 직접 수정한 요약" } });
    for (const button of screen.getAllByRole("button", { name: "AI 근거 검토 완료" })) {
      fireEvent.click(button);
    }
    fireEvent.click(screen.getByRole("button", { name: "직접 수정 내용 확인" }));
    const commit = screen.getByRole("button", { name: "AI 기록 저장" });
    await waitFor(() => expect(commit).toBeEnabled());
    fireEvent.click(commit);

    expect(await screen.findByRole("alert")).toHaveTextContent(/현재 편집은 자동으로 덮어쓰지 않았습니다/);
    expect(screen.getByDisplayValue("호스트가 직접 수정한 요약")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "최신 revision 다시 불러오기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 기록 저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "요약 재생성" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "AI 기록 저장" }));
    expect(mockedCommit).toHaveBeenCalledTimes(1);
  });

  it("invalidates an edited grounded section even when the provider returned no evidence blocks", async () => {
    mockedStart.mockResolvedValue({ jobId: "job-1", status: "PENDING", expiresAt: "2026-07-14T12:00:00Z" });
    mockedGetJob.mockResolvedValue({ ...groundedJob(), evidence: [] });
    const { Wrapper } = createWrapper();
    render(<Wrapper><AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} /></Wrapper>);
    fireEvent.change(await screen.findByLabelText(/대본 파일/), {
      target: { files: [new File(["공개 회원 00:00\n합성 대화"], "transcript.txt")] },
    });
    const start = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);

    fireEvent.change(await screen.findByLabelText("요약"), { target: { value: "직접 수정한 요약" } });
    expect(screen.getByRole("button", { name: "직접 수정 내용 확인" })).toBeInTheDocument();
  });

  it("associates each authored list item with its own evidence control", async () => {
    mockedStart.mockResolvedValue({ jobId: "job-1", status: "PENDING", expiresAt: "2026-07-14T12:00:00Z" });
    mockedGetJob.mockResolvedValue(groundedJob());
    const { Wrapper } = createWrapper();
    render(<Wrapper><AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} /></Wrapper>);
    fireEvent.change(await screen.findByLabelText(/대본 파일/), {
      target: { files: [new File(["공개 회원 00:00\n합성 대화"], "transcript.txt")] },
    });
    const start = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);

    const highlightRow = (await screen.findByLabelText("하이라이트 1 내용")).closest("li");
    expect(highlightRow).not.toBeNull();
    expect(within(highlightRow!).getByRole("button", { name: "하이라이트 1 근거 보기" })).toBeInTheDocument();
    const oneLineRow = screen.getByLabelText("한줄평 1 내용").closest("li");
    expect(oneLineRow).not.toBeNull();
    expect(within(oneLineRow!).getByRole("button", { name: "한줄평 1 근거 보기" })).toBeInTheDocument();
  });

  it("replaces the full grounded result and resets all reviews on regeneration", async () => {
    mockedStart.mockResolvedValue({ jobId: "job-1", status: "PENDING", expiresAt: "2026-07-14T12:00:00Z" });
    mockedGetJob.mockResolvedValue(groundedJob());
    const regenerated = sampleSnapshot();
    regenerated.summary = "revision 4 합성 요약";
    mockedRegenerate.mockResolvedValue({
      item: "summary",
      value: { summary: regenerated.summary },
      tokens: { input: 10, cachedInput: 0, output: 5 },
      costEstimateUsd: "0.01",
      warnings: [],
      revision: 4,
      result: regenerated,
      evidence: groundedJob().evidence?.map((item) => ({
        ...item,
        targetId: item.targetId.replace("r3:", "r4:"),
      })),
      sectionReviewStatuses: {
        SUMMARY: "PENDING_REVIEW",
        HIGHLIGHTS: "PENDING_REVIEW",
        ONE_LINE_REVIEWS: "PENDING_REVIEW",
        FEEDBACK_DOCUMENT: "PENDING_REVIEW",
      },
    });
    const { Wrapper } = createWrapper();
    render(<Wrapper><AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} /></Wrapper>);
    fireEvent.change(await screen.findByLabelText(/대본 파일/), {
      target: { files: [new File(["공개 회원 00:00\n합성 대화"], "transcript.txt")] },
    });
    const start = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    for (const button of await screen.findAllByRole("button", { name: "AI 근거 검토 완료" })) {
      fireEvent.click(button);
    }
    expect(screen.getByRole("button", { name: "AI 기록 저장" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "요약 재생성" }));
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() => expect(mockedRegenerate).toHaveBeenCalledTimes(1));
    expect(mockedRegenerate.mock.calls[0]?.[2]).toMatchObject({
      item: "SUMMARY",
      expectedRevision: 3,
    });
    expect(await screen.findByDisplayValue("revision 4 합성 요약")).toBeInTheDocument();
    expect(screen.getByText("0/4 검토 완료")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 기록 저장" })).toBeDisabled();
  });

  it("shows saving state when poll returns COMMITTING", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    });
    mockedGetJob.mockResolvedValue(jobResponse("COMMITTING"));

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
    await waitFor(() => expect(submit).toBeEnabled());
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(await screen.findByRole("status")).toHaveTextContent("AI 기록을 저장하는 중입니다.");
    expect(screen.queryByRole("button", { name: /기록 저장/ })).not.toBeInTheDocument();
  });

  it("treats server COMMITTED status as completed and calls onCommitted once", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    });
    mockedGetJob.mockResolvedValue(jobResponse("COMMITTED"));

    const onCommitted = vi.fn();
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={onCommitted} />
      </Wrapper>,
    );

    await screen.findByText("AI로 세션 기록 생성");
    const file = new File(["t"], "transcript.txt", { type: "text/plain" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/대본 파일/), { target: { files: [file] } });
    });
    const submit = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(await screen.findByRole("status")).toHaveTextContent("AI 기록 저장을 완료했습니다.");
    expect(onCommitted).toHaveBeenCalledTimes(1);
  });

  it("keeps submit disabled and exposes retry when session models cannot be loaded", async () => {
    mockedModels.mockReset();
    mockedModels.mockRejectedValue(new Error("AI generation is disabled"));

    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} />
      </Wrapper>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("사용 가능한 모델을 불러오지 못했습니다");
    expect(screen.getByRole("button", { name: "생성 시작" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "모델 다시 불러오기" })).toBeInTheDocument();
  });

  it("returns ERROR → IDLE when retry is clicked", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    });
    mockedGetJob.mockResolvedValue(
      jobResponse("FAILED", { error: { code: "LLM_TIMEOUT", message: "실패" } }),
    );

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

    const retryBtn = await screen.findByRole("button", { name: /다시 시도/ });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /생성 시작/ })).toBeInTheDocument();
    });
  });
});
