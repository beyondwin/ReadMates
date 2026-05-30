import { describe, expect, it } from "vitest";
import {
  AI_OPS_DEFAULT_WINDOW,
  EMPTY_AI_OPS_FILTER,
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  aiOpsSearchFromFilter,
  aiOpsWindowFromSearchParams,
  hasActiveAiOpsFilter,
} from "./platform-admin-ai-ops-model";

describe("platform-admin ai-ops filter model", () => {
  it("parses errorCode and clubId from search params", () => {
    const params = new URLSearchParams("errorCode=PROVIDER_RATE_LIMITED&clubId=club-1");
    expect(aiOpsFilterFromSearchParams(params)).toEqual({
      errorCode: "PROVIDER_RATE_LIMITED",
      clubId: "club-1",
    });
  });

  it("treats empty/absent params as null", () => {
    expect(aiOpsFilterFromSearchParams(new URLSearchParams(""))).toEqual(EMPTY_AI_OPS_FILTER);
    expect(aiOpsFilterFromSearchParams(new URLSearchParams("errorCode="))).toEqual(EMPTY_AI_OPS_FILTER);
  });

  it("serializes only set fields, dropping nulls", () => {
    expect(aiOpsSearchFromFilter({ errorCode: "X", clubId: null }).toString()).toBe("errorCode=X");
    expect(aiOpsSearchFromFilter(EMPTY_AI_OPS_FILTER).toString()).toBe("");
  });

  it("reports active filter state", () => {
    expect(hasActiveAiOpsFilter(EMPTY_AI_OPS_FILTER)).toBe(false);
    expect(hasActiveAiOpsFilter({ errorCode: "X", clubId: null })).toBe(true);
    expect(hasActiveAiOpsFilter({ errorCode: null, clubId: "club-1" })).toBe(true);
  });

  it("maps filter to the API query shape, omitting nulls", () => {
    expect(aiOpsFilterToQuery({ errorCode: "X", clubId: null })).toEqual({ errorCode: "X" });
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
