import { writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

export const SECURITY_COMMAND_ID = "playwright-authority-cache-regressions";

const expectedSecurityCases = [
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
] as const;

type SecurityCase = (typeof expectedSecurityCases)[number];

export type SecurityEvidenceProof = {
  file: string;
  title: string;
  cases: readonly string[];
};

type TestObservation = {
  file: string;
  title: string;
  status: string;
  expectedStatus: string;
};

type SecurityReport = {
  schemaVersion: "readmates.host-rollout.test-report.v1";
  group: "security";
  commands: Array<{
    id: typeof SECURITY_COMMAND_ID;
    result: "PASS";
    source: "structured-test-reporter";
  }>;
  cases: Array<{
    id: SecurityCase;
    result: "PASS";
    commandId: typeof SECURITY_COMMAND_ID;
  }>;
  completedAt: string;
};

export const securityEvidenceCatalog: readonly SecurityEvidenceProof[] = [
  {
    file: "tests/e2e/host-authority-loss.spec.ts",
    title: "revoked authority cancels in-flight host work and cannot resurrect a meeting form",
    cases: [
      "host-authority-revoked",
      "inflight-request-cancelled",
      "exact-club-state-purged",
      "other-club-state-preserved",
      "back-reload-new-tab-offline-no-resurrection",
    ],
  },
  {
    file: "tests/e2e/host-authority-loss.spec.ts",
    title: "suspension purges an open record draft before replacing the host workspace",
    cases: ["membership-suspended"],
  },
  {
    file: "tests/e2e/host-authority-loss.spec.ts",
    title: "cross-club scope purges the requested club without touching an open other-club preview",
    cases: ["cross-club-scope"],
  },
  {
    file: "tests/e2e/host-authority-loss.spec.ts",
    title: "revision conflict preserves the local meeting form draft",
    cases: ["revision-conflict-preserves-draft"],
  },
  {
    file: "tests/e2e/host-authority-loss.spec.ts",
    title: "authorized response loss reconciles before retry and preserves the meeting form draft",
    cases: ["authorized-response-loss-preserves-draft"],
  },
  {
    file: "tests/e2e/public-projection-cache-safety.spec.ts",
    title: "@prechange browser retains the previous 120 plus 600 policy for the full 720-second window",
    cases: [],
  },
  {
    file: "tests/e2e/public-projection-cache-safety.spec.ts",
    title: "@policy-deployed origin and generation-checking edge never serve a revoked old generation",
    cases: ["origin-immediate-deny-rerun", "old-generation-not-reserved-rerun"],
  },
  {
    file: "tests/e2e/public-projection-cache-safety.spec.ts",
    title: "new browser policy converges general reads by 120 seconds and emergency reads by 60 without revoked SWR",
    cases: ["browser-general-120s-rerun", "browser-emergency-60s-rerun"],
  },
] as const;

function normalizedEvidenceFile(file: string, expectedFiles: Set<string>): string {
  const normalized = file.replaceAll("\\", "/");
  for (const expected of expectedFiles) {
    if (normalized === expected || normalized.endsWith(`/${expected}`)) return expected;
  }
  throw new Error(`security evidence received an unexpected source file: ${file}`);
}

function callbackKey(file: string, title: string) {
  return `${file}\u0000${title}`;
}

export class CausalSecurityEvidenceAggregator {
  private readonly proofs: Map<string, SecurityEvidenceProof>;
  private readonly expectedFiles: Set<string>;
  private readonly observed = new Map<string, TestObservation>();

  constructor(catalog: readonly SecurityEvidenceProof[] = securityEvidenceCatalog) {
    this.expectedFiles = new Set(catalog.map((proof) => proof.file));
    this.proofs = new Map();
    const configuredCases = new Set<string>();
    const expectedCases = new Set<string>(expectedSecurityCases);
    for (const proof of catalog) {
      const key = callbackKey(proof.file, proof.title);
      if (this.proofs.has(key)) throw new Error(`security evidence catalog has a duplicate test: ${proof.title}`);
      this.proofs.set(key, proof);
      for (const caseId of proof.cases) {
        if (!expectedCases.has(caseId)) throw new Error(`security evidence catalog has an unknown case: ${caseId}`);
        if (configuredCases.has(caseId)) throw new Error(`security evidence catalog has a duplicate case: ${caseId}`);
        configuredCases.add(caseId);
      }
    }
    if (configuredCases.size !== expectedCases.size) {
      throw new Error("security evidence catalog case set is incomplete");
    }
  }

  record(observation: TestObservation) {
    const file = normalizedEvidenceFile(observation.file, this.expectedFiles);
    const key = callbackKey(file, observation.title);
    if (!this.proofs.has(key)) throw new Error(`security evidence received an unknown test: ${observation.title}`);
    if (this.observed.has(key)) throw new Error(`security evidence received a duplicate callback: ${observation.title}`);
    this.observed.set(key, { ...observation, file });
  }

  finalize(completedAt = new Date()): SecurityReport {
    const missing = [...this.proofs.keys()].filter((key) => !this.observed.has(key));
    if (missing.length > 0) throw new Error(`security evidence callback set is missing ${missing.length} test(s)`);
    for (const [key, observation] of this.observed) {
      if (observation.status !== "passed" || observation.expectedStatus !== "passed") {
        throw new Error(`security evidence test did not pass: ${this.proofs.get(key)?.title ?? observation.title}`);
      }
    }
    const cases = [...this.proofs.values()]
      .flatMap((proof) => proof.cases)
      .sort()
      .map((id) => ({
        id: id as SecurityCase,
        result: "PASS" as const,
        commandId: SECURITY_COMMAND_ID,
      }));
    return {
      schemaVersion: "readmates.host-rollout.test-report.v1",
      group: "security",
      commands: [{ id: SECURITY_COMMAND_ID, result: "PASS", source: "structured-test-reporter" }],
      cases,
      completedAt: completedAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    };
  }
}

export function protectedSecurityReporterEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return environment.GITHUB_ACTIONS === "true"
    && environment.READMATES_HOST_ROLLOUT_LIVE_EVIDENCE === "protected"
    && environment.READMATES_HOST_ROLLOUT_COMMAND_ID === SECURITY_COMMAND_ID;
}

export default class HostAuthorityCacheSecurityReporter implements Reporter {
  private readonly aggregator = new CausalSecurityEvidenceAggregator();
  private failure: Error | null = null;

  onTestEnd(test: TestCase, result: TestResult) {
    if (this.failure) return;
    try {
      this.aggregator.record({
        file: test.location.file,
        title: test.title,
        status: result.status,
        expectedStatus: test.expectedStatus,
      });
    } catch (error) {
      this.failure = error instanceof Error ? error : new Error(String(error));
    }
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult["status"] } | void> {
    if (result.status !== "passed" && !this.failure) {
      this.failure = new Error(`security evidence Playwright run did not pass: ${result.status}`);
    }
    try {
      if (this.failure) throw this.failure;
      const configured = process.env.READMATES_HOST_ROLLOUT_CASE_REPORT;
      if (!configured) throw new Error("READMATES_HOST_ROLLOUT_CASE_REPORT is required");
      const output = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
      writeFileSync(output, `${JSON.stringify(this.aggregator.finalize())}\n`, { flag: "wx" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Host authority/cache security reporter failed: ${message}\n`);
      return { status: "failed" };
    }
  }
}
