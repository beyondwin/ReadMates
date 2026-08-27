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
