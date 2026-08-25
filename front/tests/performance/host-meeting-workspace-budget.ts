export const HOST_MEETING_PERFORMANCE_BUDGETS = {
  decodedJsonBytes: 500 * 1024,
  routeDataToUsableMs: 1_000,
  inputToRafCommitMs: 100,
  authoritativeSaveToRowCommitMs: 100,
  forcedGcHeapDeltaBytes: 25 * 1024 * 1024,
} as const;

export type HostMeetingPerformanceMetric = keyof typeof HOST_MEETING_PERFORMANCE_BUDGETS;

export type HostMeetingPerformanceRun = {
  syntheticMemberCount: 500;
} & Record<HostMeetingPerformanceMetric, number>;

type MetricSummary = {
  unit: "bytes" | "milliseconds";
  maximum: number;
  raw: [number, number, number, number, number];
  median: number;
  passed: boolean;
};

export type HostMeetingPerformanceSummary = {
  schema: "readmates.host-meeting-performance.v1";
  syntheticMemberCount: 500;
  runCount: 5;
  metrics: Record<HostMeetingPerformanceMetric, MetricSummary>;
  passed: boolean;
};

const METRICS = Object.keys(HOST_MEETING_PERFORMANCE_BUDGETS) as HostMeetingPerformanceMetric[];

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

export function summarizeHostMeetingPerformance(
  runs: readonly HostMeetingPerformanceRun[],
): HostMeetingPerformanceSummary {
  if (runs.length !== 5) {
    throw new Error("Host meeting performance evidence requires exactly five cold runs.");
  }
  if (runs.some((run) => run.syntheticMemberCount !== 500)) {
    throw new Error("Host meeting performance evidence requires exactly 500 synthetic members per run.");
  }

  const metrics = Object.fromEntries(METRICS.map((metric) => {
    const values = runs.map((run) => run[metric]);
    if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`${metric} must contain five finite raw values.`);
    }
    if (metric !== "forcedGcHeapDeltaBytes" && values.some((value) => value < 0)) {
      throw new Error(`${metric} cannot contain negative values.`);
    }
    const raw = values as [number, number, number, number, number];
    const maximum = HOST_MEETING_PERFORMANCE_BUDGETS[metric];
    return [metric, {
      unit: metric.endsWith("Bytes") ? "bytes" : "milliseconds",
      maximum,
      raw,
      median: median(raw),
      passed: raw.every((value) => value <= maximum),
    } satisfies MetricSummary];
  })) as Record<HostMeetingPerformanceMetric, MetricSummary>;

  return {
    schema: "readmates.host-meeting-performance.v1",
    syntheticMemberCount: 500,
    runCount: 5,
    metrics,
    passed: METRICS.every((metric) => metrics[metric].passed),
  };
}
