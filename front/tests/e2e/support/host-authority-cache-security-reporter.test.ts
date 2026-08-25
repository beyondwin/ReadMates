import { describe, expect, it } from "vitest";
import {
  CausalSecurityEvidenceAggregator,
  SECURITY_COMMAND_ID,
  securityEvidenceCatalog,
} from "./host-authority-cache-security-reporter";

function passingObservations() {
  return securityEvidenceCatalog.map((proof) => ({
    file: `/workspace/front/${proof.file}`,
    title: proof.title,
    status: "passed" as const,
    expectedStatus: "passed" as const,
  }));
}

describe("causal host authority and cache security evidence", () => {
  it("aggregates actual passing callbacks from both specs without file-order dependence", () => {
    const aggregator = new CausalSecurityEvidenceAggregator();
    for (const observation of passingObservations().reverse()) aggregator.record(observation);

    const report = aggregator.finalize(new Date("2026-08-25T12:34:56.789Z"));

    expect(report.commands).toEqual([
      { id: SECURITY_COMMAND_ID, result: "PASS", source: "structured-test-reporter" },
    ]);
    expect(report.cases).toHaveLength(13);
    expect(new Set(report.cases.map((item) => item.id))).toEqual(new Set([
      "host-authority-revoked",
      "membership-suspended",
      "cross-club-scope",
      "inflight-request-cancelled",
      "exact-club-state-purged",
      "other-club-state-preserved",
      "back-reload-new-tab-offline-no-resurrection",
      "revision-conflict-preserves-draft",
      "authorized-response-loss-preserves-draft",
      "origin-immediate-deny-rerun",
      "old-generation-not-reserved-rerun",
      "browser-general-120s-rerun",
      "browser-emergency-60s-rerun",
    ]));
    expect(report.completedAt).toBe("2026-08-25T12:34:56Z");
  });

  it.each([
    ["failed", "failed"],
    ["skipped", "skipped"],
    ["interrupted", "interrupted"],
  ] as const)("fails closed when a substantive callback is %s", (_label, status) => {
    const aggregator = new CausalSecurityEvidenceAggregator();
    const [first, ...rest] = passingObservations();
    aggregator.record({ ...first, status });
    for (const observation of rest) aggregator.record(observation);

    expect(() => aggregator.finalize()).toThrow(/did not pass/);
  });

  it("fails closed when a callback is missing", () => {
    const aggregator = new CausalSecurityEvidenceAggregator();
    for (const observation of passingObservations().slice(1)) aggregator.record(observation);

    expect(() => aggregator.finalize()).toThrow(/missing/);
  });

  it("fails closed when the same test callback is observed twice", () => {
    const aggregator = new CausalSecurityEvidenceAggregator();
    const observations = passingObservations();
    for (const observation of observations) aggregator.record(observation);

    expect(() => aggregator.record(observations[0])).toThrow(/duplicate/);
  });

  it("fails closed on an unknown test or unexpected source file", () => {
    const unknown = new CausalSecurityEvidenceAggregator();
    expect(() => unknown.record({
      file: "/workspace/front/tests/e2e/host-authority-loss.spec.ts",
      title: "unmapped proof",
      status: "passed",
      expectedStatus: "passed",
    })).toThrow(/unknown test/);

    const unexpected = new CausalSecurityEvidenceAggregator();
    expect(() => unexpected.record({
      file: "/workspace/front/tests/e2e/untrusted.spec.ts",
      title: securityEvidenceCatalog[0].title,
      status: "passed",
      expectedStatus: "passed",
    })).toThrow(/unexpected source/);
  });

  it("fails closed when the configured proof catalog contains an unknown or duplicate case", () => {
    expect(() => new CausalSecurityEvidenceAggregator([
      ...securityEvidenceCatalog,
      {
        file: "tests/e2e/host-authority-loss.spec.ts",
        title: "unknown case producer",
        cases: ["not-in-the-command-contract"],
      },
    ])).toThrow(/unknown case/);

    expect(() => new CausalSecurityEvidenceAggregator([
      ...securityEvidenceCatalog,
      {
        file: "tests/e2e/host-authority-loss.spec.ts",
        title: "duplicate case producer",
        cases: ["host-authority-revoked"],
      },
    ])).toThrow(/duplicate case/);
  });
});
