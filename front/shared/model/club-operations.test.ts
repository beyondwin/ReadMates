import { describe, expect, it } from "vitest";
import { clubAiFailureDelta, type ClubAiUsageSummary } from "./club-operations";

function aiUsage(overrides: Partial<ClubAiUsageSummary> = {}): ClubAiUsageSummary {
  return {
    activeJobs: 0,
    failedRecentJobs: 0,
    staleCandidates: 0,
    costEstimateUsd: "0.0000",
    state: "HEALTHY",
    priorFailedJobs7d: 0,
    ...overrides,
  };
}

describe("clubAiFailureDelta", () => {
  it("returns the recent-minus-prior failure delta", () => {
    expect(clubAiFailureDelta(aiUsage({ failedRecentJobs: 5, priorFailedJobs7d: 2 }))).toBe(3);
  });

  it("returns a negative delta when failures dropped", () => {
    expect(clubAiFailureDelta(aiUsage({ failedRecentJobs: 1, priorFailedJobs7d: 4 }))).toBe(-3);
  });

  it("returns zero when both windows are empty", () => {
    expect(clubAiFailureDelta(aiUsage())).toBe(0);
  });
});
