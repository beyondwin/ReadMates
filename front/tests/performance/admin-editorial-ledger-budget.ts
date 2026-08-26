export const ADMIN_EDITORIAL_LEDGER_PERFORMANCE_BUDGETS = {
  decodedJsonBytes: 250 * 1024,
  routeDataToUsableMs: 1_000,
  filterToRafCommitMs: 100,
  caseSelectionToDocketCommitMs: 100,
  pollMergeToRafCommitMs: 100,
  forcedGcHeapDeltaBytes: 25 * 1024 * 1024,
} as const;

export type AdminEditorialLedgerPerformanceMetric = keyof typeof ADMIN_EDITORIAL_LEDGER_PERFORMANCE_BUDGETS;

export type AdminEditorialLedgerPerformanceRun = {
  syntheticCaseCount: 100;
} & Record<AdminEditorialLedgerPerformanceMetric, number>;

type MetricSummary = {
  unit: "bytes" | "milliseconds";
  maximum: number;
  raw: [number, number, number, number, number];
  median: number;
  passed: boolean;
};

export type AdminEditorialLedgerPerformanceSummary = {
  schema: "readmates.admin-editorial-ledger-performance.v1";
  syntheticCaseCount: 100;
  runCount: 5;
  metrics: Record<AdminEditorialLedgerPerformanceMetric, MetricSummary>;
  passed: boolean;
};

const METRICS = Object.keys(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_BUDGETS) as AdminEditorialLedgerPerformanceMetric[];

export function decodedUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export type DecodedJsonResponse = {
  url: string;
  status: number;
  contentType: string;
  text: string;
};

export function sumDecodedJsonResponseBytes(responses: readonly DecodedJsonResponse[]): number {
  return responses.reduce((total, response) => {
    if (response.status === 204 || !/(?:application\/json|\+json)(?:;|$)/i.test(response.contentType)) return total;
    return total + decodedUtf8Bytes(response.text);
  }, 0);
}

function median(values: readonly number[]): number {
  return [...values].sort((left, right) => left - right)[2];
}

export function summarizeAdminEditorialLedgerPerformance(
  runs: readonly AdminEditorialLedgerPerformanceRun[],
): AdminEditorialLedgerPerformanceSummary {
  if (runs.length !== 5) {
    throw new Error("Admin editorial ledger performance evidence requires exactly five cold runs.");
  }
  if (runs.some((run) => run.syntheticCaseCount !== 100)) {
    throw new Error("Admin editorial ledger performance evidence requires exactly 100 synthetic cases per run.");
  }

  const metrics = Object.fromEntries(METRICS.map((metric) => {
    const values = runs.map((run) => run[metric]);
    if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`${metric} must contain five finite raw values.`);
    }
    if (values.some((value) => value < 0)) {
      throw new Error(`${metric} cannot contain negative values.`);
    }
    const raw = values as [number, number, number, number, number];
    const maximum = ADMIN_EDITORIAL_LEDGER_PERFORMANCE_BUDGETS[metric];
    return [metric, {
      unit: metric.endsWith("Bytes") ? "bytes" : "milliseconds",
      maximum,
      raw,
      median: median(raw),
      passed: raw.every((value) => value <= maximum),
    } satisfies MetricSummary];
  })) as Record<AdminEditorialLedgerPerformanceMetric, MetricSummary>;

  return {
    schema: "readmates.admin-editorial-ledger-performance.v1",
    syntheticCaseCount: 100,
    runCount: 5,
    metrics,
    passed: METRICS.every((metric) => metrics[metric].passed),
  };
}
