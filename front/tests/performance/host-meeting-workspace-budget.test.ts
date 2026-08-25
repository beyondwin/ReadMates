import { describe, expect, it } from "vitest";
import {
  HOST_MEETING_PERFORMANCE_BUDGETS,
  decodedUtf8Bytes,
  sumDecodedJsonResponseBytes,
  summarizeHostMeetingPerformance,
  type HostMeetingPerformanceRun,
} from "./host-meeting-workspace-budget";

const run = (offset = 0): HostMeetingPerformanceRun => ({
  syntheticMemberCount: 500,
  decodedJsonBytes: 480_000 + offset,
  routeDataToUsableMs: 700 + offset,
  inputToRafCommitMs: 60 + offset,
  authoritativeSaveToRowCommitMs: 70 + offset,
  forcedGcHeapDeltaBytes: 18_000_000 + offset,
});

describe("host meeting performance budget model", () => {
  it("uses the five approved budgets and UTF-8 decoded byte accounting", () => {
    expect(HOST_MEETING_PERFORMANCE_BUDGETS).toEqual({
      decodedJsonBytes: 500 * 1024,
      routeDataToUsableMs: 1_000,
      inputToRafCommitMs: 100,
      authoritativeSaveToRowCommitMs: 100,
      forcedGcHeapDeltaBytes: 25 * 1024 * 1024,
    });
    expect(decodedUtf8Bytes("한글A")).toBe(7);
    expect(sumDecodedJsonResponseBytes([
      { url: "/api/a", status: 200, contentType: "application/json", text: "한글" },
      { url: "/api/b", status: 204, contentType: "application/json", text: "" },
      { url: "/api/c", status: 200, contentType: "text/plain", text: "ignored" },
      { url: "/api/d", status: 200, contentType: "application/problem+json", text: "{}" },
    ])).toBe(8);
  });

  it("emits only five raw public-safe values and their median", () => {
    const summary = summarizeHostMeetingPerformance([run(0), run(1), run(2), run(3), run(4)]);

    expect(summary.schema).toBe("readmates.host-meeting-performance.v1");
    expect(summary.syntheticMemberCount).toBe(500);
    expect(summary.runCount).toBe(5);
    expect(summary.metrics.routeDataToUsableMs.raw).toEqual([700, 701, 702, 703, 704]);
    expect(summary.metrics.routeDataToUsableMs.median).toBe(702);
    expect(Object.keys(summary.metrics)).toEqual(Object.keys(HOST_MEETING_PERFORMANCE_BUDGETS));
    expect(JSON.stringify(summary)).not.toMatch(/member-|displayName|https?:\/\//);
  });

  it("fails closed for missing, non-finite, wrong-size, or wrong-member runs", () => {
    expect(() => summarizeHostMeetingPerformance([run(), run(), run(), run()])).toThrow(/exactly five/i);
    expect(() => summarizeHostMeetingPerformance([
      run(), run(), { ...run(), syntheticMemberCount: 499 }, run(), run(),
    ])).toThrow(/500/);
    expect(() => summarizeHostMeetingPerformance([
      run(), run(), { ...run(), inputToRafCommitMs: Number.NaN }, run(), run(),
    ])).toThrow(/finite/i);
    const missing = run() as Partial<HostMeetingPerformanceRun>;
    delete missing.authoritativeSaveToRowCommitMs;
    expect(() => summarizeHostMeetingPerformance([
      run(), run(), missing as HostMeetingPerformanceRun, run(), run(),
    ])).toThrow(/finite/i);
  });

  it("reports a budget failure without dropping the raw evidence", () => {
    const summary = summarizeHostMeetingPerformance([
      run(), run(), run(), run(), { ...run(), routeDataToUsableMs: 1_001 },
    ]);

    expect(summary.passed).toBe(false);
    expect(summary.metrics.routeDataToUsableMs.passed).toBe(false);
    expect(summary.metrics.routeDataToUsableMs.raw).toContain(1_001);
  });
});
