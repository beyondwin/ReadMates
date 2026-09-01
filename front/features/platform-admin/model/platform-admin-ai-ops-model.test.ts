import { describe, expect, it } from "vitest";
import {
  AI_OPS_DEFAULT_WINDOW,
  EMPTY_AI_OPS_FILTER,
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  aiOpsPathFromFilter,
  aiOpsSearchFromFilter,
  aiOpsWindowFromSearchParams,
  classifyAiOpsError,
  formatAiJobElapsedLabel,
  aiOpsJobStageLanguage,
  aiOpsJobStatusLanguage,
  buildAiOpsServiceDetail,
  buildAiOpsJobNarrative,
  mergeAiOpsJobPages,
  hasActiveAiOpsFilter,
} from "./platform-admin-ai-ops-model";

describe("platform-admin ai-ops filter model", () => {
  it("parses errorCode and clubId from search params", () => {
    const params = new URLSearchParams("errorCode=PROVIDER_RATE_LIMITED&clubId=club-1&jobId=job-7");
    expect(aiOpsFilterFromSearchParams(params)).toEqual({
      errorCode: "PROVIDER_RATE_LIMITED",
      clubId: "club-1",
      jobId: "job-7",
    });
  });

  it("treats empty/absent params as null", () => {
    expect(aiOpsFilterFromSearchParams(new URLSearchParams(""))).toEqual(EMPTY_AI_OPS_FILTER);
    expect(aiOpsFilterFromSearchParams(new URLSearchParams("errorCode="))).toEqual(EMPTY_AI_OPS_FILTER);
  });

  it("serializes only set fields, dropping nulls", () => {
    expect(aiOpsSearchFromFilter({ errorCode: "X", clubId: null, jobId: "job-7" }).toString()).toBe(
      "errorCode=X&jobId=job-7",
    );
    expect(aiOpsSearchFromFilter(EMPTY_AI_OPS_FILTER).toString()).toBe("");
  });

  it("reports active filter state", () => {
    expect(hasActiveAiOpsFilter(EMPTY_AI_OPS_FILTER)).toBe(false);
    expect(hasActiveAiOpsFilter({ errorCode: "X", clubId: null, jobId: null })).toBe(true);
    expect(hasActiveAiOpsFilter({ errorCode: null, clubId: "club-1", jobId: null })).toBe(true);
  });

  it("maps filter to the API query shape, omitting nulls", () => {
    expect(aiOpsFilterToQuery({ errorCode: "X", clubId: null, jobId: "job-7" })).toEqual({ errorCode: "X" });
    expect(aiOpsFilterToQuery(EMPTY_AI_OPS_FILTER)).toEqual({});
  });
});

describe("aiOpsWindowFromSearchParams", () => {
  it("reads a valid window", () => {
    expect(aiOpsWindowFromSearchParams(new URLSearchParams("window=7d"))).toBe("7d");
    expect(aiOpsWindowFromSearchParams(new URLSearchParams("window=90d"))).toBe("90d");
  });

  it("falls back to the default for missing or unknown window", () => {
    expect(aiOpsWindowFromSearchParams(new URLSearchParams())).toBe(AI_OPS_DEFAULT_WINDOW);
    expect(aiOpsWindowFromSearchParams(new URLSearchParams("window=year"))).toBe(AI_OPS_DEFAULT_WINDOW);
  });
});

describe("aiOpsPathFromFilter", () => {
  it("returns the bare ai-ops path when no filter is active", () => {
    expect(aiOpsPathFromFilter(EMPTY_AI_OPS_FILTER)).toBe("/admin/ai-ops");
  });

  it("appends clubId as ai-ops URL state", () => {
    expect(aiOpsPathFromFilter({ errorCode: null, clubId: "club-1", jobId: null })).toBe(
      "/admin/ai-ops?clubId=club-1",
    );
  });

  it("appends errorCode as ai-ops URL state", () => {
    expect(aiOpsPathFromFilter({ errorCode: "PROVIDER_RATE_LIMITED", clubId: null, jobId: null })).toBe(
      "/admin/ai-ops?errorCode=PROVIDER_RATE_LIMITED",
    );
  });

  it("links directly to a selected job without exposing content", () => {
    expect(aiOpsPathFromFilter({ errorCode: null, clubId: null, jobId: "job-7" })).toBe(
      "/admin/ai-ops?jobId=job-7",
    );
  });
});

describe("AI 작업 paged ledger", () => {
  it("keeps page order while removing a duplicate cursor-boundary job", () => {
    const job = (jobId: string) => ({ jobId } as never);
    expect(
      mergeAiOpsJobPages([
        { items: [job("job-1"), job("job-2")], nextCursor: "cursor-2" },
        { items: [job("job-2"), job("job-3")], nextCursor: null },
      ]).map((item) => item.jobId),
    ).toEqual(["job-1", "job-2", "job-3"]);
  });
});

describe("AI 작업 elapsed labels", () => {
  const now = new Date("2026-05-18T00:21:00Z");

  it("labels an in-progress job with elapsed minutes", () => {
    expect(
      formatAiJobElapsedLabel(
        {
          status: "RUNNING",
          createdAt: "2026-05-18T00:16:00Z",
          lastUpdatedAt: "2026-05-18T00:20:00Z",
          staleCandidate: false,
        },
        now,
      ),
    ).toBe("5분째 진행");
  });

  it("warns when an in-progress job has stalled past the threshold", () => {
    expect(
      formatAiJobElapsedLabel(
        {
          status: "RUNNING",
          createdAt: "2026-05-18T00:00:00Z",
          lastUpdatedAt: "2026-05-18T00:01:00Z",
          staleCandidate: true,
        },
        now,
      ),
    ).toBe("멈춤 의심 · 20분");
  });

  it("omits elapsed labels for terminal jobs", () => {
    expect(
      formatAiJobElapsedLabel(
        {
          status: "FAILED",
          createdAt: "2026-05-18T00:00:00Z",
          lastUpdatedAt: "2026-05-18T00:01:00Z",
          staleCandidate: false,
        },
        now,
      ),
    ).toBeNull();
  });
});

describe("AI 작업 semantic language", () => {
  it("maps status and stage while keeping unknown raw values out of primary copy", () => {
    expect(aiOpsJobStatusLanguage("RUNNING").primaryText).toBe("진행 중");
    expect(aiOpsJobStatusLanguage("FAILED").primaryText).toBe("실패");
    expect(aiOpsJobStageLanguage("GENERATING_SUMMARY").primaryText).toBe("요약 생성 중");
    expect(aiOpsJobStageLanguage("FUTURE_STAGE")).toEqual({
      primaryText: "확인 필요",
      technicalDisclosure: { label: "기술 값", value: "FUTURE_STAGE" },
    });
  });
});

describe("AI service detail narrative", () => {
  const job = (overrides: Record<string, unknown> = {}) => ({
    jobId: "job-1",
    club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
    session: { sessionId: "session-1", number: 7, bookTitle: "Book" },
    status: "RUNNING",
    stage: "GENERATING_SUMMARY",
    provider: "OPENAI",
    model: "gpt-model",
    errorCode: null,
    safeErrorMessage: null,
    costEstimateUsd: "0.1200",
    createdAt: "2026-05-18T00:00:00Z",
    lastUpdatedAt: "2026-05-18T00:01:00Z",
    expiresAt: null,
    staleCandidate: true,
    revision: 2,
    cleanupPending: true,
    availableActions: ["FORCE_CANCEL"],
    ...overrides,
  });

  const summary = {
    activeJobCount: 2,
    failedLast24h: 1,
    monthToDateCostEstimateUsd: "0.2000",
    failureCodes: [{ code: "PROVIDER_RATE_LIMITED", count: 1 }],
    providerCosts: [],
    staleCandidateCount: 1,
    costTrend: {
      window: "30d" as const,
      currentCostUsd: "0.2000",
      priorCostUsd: "0.1000",
      currentJobCount: 2,
      priorJobCount: 1,
      deltaDirection: "UP" as const,
      availability: "AVAILABLE" as const,
    },
  };

  it("puts the operator sentence, latest real update, and next safe action ahead of identifiers", () => {
    expect(buildAiOpsServiceDetail(summary, [
      job(),
      job({ jobId: "job-2", lastUpdatedAt: "2026-05-18T00:05:00Z" }),
    ])).toEqual({
      operatorSentence: "최근 24시간 실패 1건과 오래 멈춘 작업 1건을 먼저 확인하세요.",
      latestObservedAt: "2026-05-18T00:05:00Z",
      nextSafeAction: "실패 원인을 좁힌 뒤 멈춘 작업의 최신 상태와 허용된 복구 방법을 확인하세요.",
    });
  });

  it("does not invent freshness when no job observation exists", () => {
    expect(buildAiOpsServiceDetail({ ...summary, activeJobCount: 0, failedLast24h: 0, staleCandidateCount: 0 }, []))
      .toEqual({
        operatorSentence: "지금 확인할 AI 처리 이상은 없습니다.",
        latestObservedAt: null,
        nextSafeAction: "새 이상 신호가 생기기 전에는 별도 조치가 필요하지 않습니다.",
      });
  });

  it("describes each run with an operator sentence and a capability-neutral next step", () => {
    expect(buildAiOpsJobNarrative(job())).toEqual({
      operatorSentence: "읽는사이의 AI 처리가 오래 멈춰 있습니다.",
      nextSafeAction: "최신 상태를 확인한 뒤 강제 취소를 검토할 수 있습니다.",
      cleanupSentence: "임시 데이터 정리가 남아 있습니다.",
    });
    expect(buildAiOpsJobNarrative(job({
      status: "FAILED",
      staleCandidate: false,
      cleanupPending: false,
      availableActions: [],
    }))).toEqual({
      operatorSentence: "읽는사이의 AI 처리가 실패했습니다.",
      nextSafeAction: "실패 원인과 최근 갱신 시각을 확인하세요.",
      cleanupSentence: "임시 데이터 정리가 끝났습니다.",
    });
  });
});

describe("AI 작업 error classification", () => {
  it("distinguishes disabled 404, unavailable 5xx, conflict, and transport unknown", () => {
    expect(classifyAiOpsError(Object.assign(new Error("missing"), { status: 404, code: "RESOURCE_NOT_FOUND" })))
      .toEqual({ kind: "DISABLED", status: 404, code: "RESOURCE_NOT_FOUND", message: "missing" });
    expect(classifyAiOpsError(Object.assign(new Error("down"), { status: 503, code: "SERVICE_UNAVAILABLE" })).kind)
      .toBe("UNAVAILABLE");
    expect(classifyAiOpsError(Object.assign(new Error("changed"), { status: 409, code: "JOB_STATE_CHANGED" })).kind)
      .toBe("CONFLICT");
    expect(classifyAiOpsError(new TypeError("network failed")).kind).toBe("UNKNOWN");
  });
});
