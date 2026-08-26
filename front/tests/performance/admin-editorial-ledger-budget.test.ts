import { describe, expect, it } from "vitest";
import {
  ADMIN_EDITORIAL_LEDGER_PERFORMANCE_BUDGETS,
  decodedUtf8Bytes,
  sumDecodedJsonResponseBytes,
  summarizeAdminEditorialLedgerPerformance,
  type AdminEditorialLedgerPerformanceRun,
} from "./admin-editorial-ledger-budget";

const run = (offset = 0): AdminEditorialLedgerPerformanceRun => ({
  syntheticCaseCount: 100,
  decodedJsonBytes: 180_000 + offset,
  routeDataToUsableMs: 700 + offset,
  filterToRafCommitMs: 60 + offset,
  caseSelectionToDocketCommitMs: 70 + offset,
  pollMergeToRafCommitMs: 55 + offset,
  forcedGcHeapDeltaBytes: 8_000_000 + offset,
});

describe("admin editorial ledger performance budget model", () => {
  it("uses the six approved budgets and UTF-8 decoded byte accounting", () => {
    expect(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_BUDGETS).toEqual({
      decodedJsonBytes: 250 * 1024,
      routeDataToUsableMs: 1_000,
      filterToRafCommitMs: 100,
      caseSelectionToDocketCommitMs: 100,
      pollMergeToRafCommitMs: 100,
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

  it("emits only six raw public-safe values and their median", () => {
    const summary = summarizeAdminEditorialLedgerPerformance([run(0), run(1), run(2), run(3), run(4)]);

    expect(summary.schema).toBe("readmates.admin-editorial-ledger-performance.v1");
    expect(summary.syntheticCaseCount).toBe(100);
    expect(summary.runCount).toBe(5);
    expect(summary.metrics.routeDataToUsableMs.raw).toEqual([700, 701, 702, 703, 704]);
    expect(summary.metrics.routeDataToUsableMs.median).toBe(702);
    expect(Object.keys(summary.metrics)).toEqual(Object.keys(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_BUDGETS));
    expect(JSON.stringify(summary)).not.toMatch(/case-|club-|@|https?:\/\//);
  });

  it("fails closed for missing, non-finite, negative, wrong-size, or wrong-case-count runs", () => {
    expect(() => summarizeAdminEditorialLedgerPerformance([run(), run(), run(), run()])).toThrow(/exactly five/i);
    expect(() => summarizeAdminEditorialLedgerPerformance([
      run(), run(), { ...run(), syntheticCaseCount: 99 }, run(), run(),
    ])).toThrow(/100/);
    expect(() => summarizeAdminEditorialLedgerPerformance([
      run(), run(), { ...run(), filterToRafCommitMs: Number.NaN }, run(), run(),
    ])).toThrow(/finite/i);
    expect(() => summarizeAdminEditorialLedgerPerformance([
      run(), run(), { ...run(), pollMergeToRafCommitMs: -1 }, run(), run(),
    ])).toThrow(/negative/i);
    const missing = run() as Partial<AdminEditorialLedgerPerformanceRun>;
    delete missing.caseSelectionToDocketCommitMs;
    expect(() => summarizeAdminEditorialLedgerPerformance([
      run(), run(), missing as AdminEditorialLedgerPerformanceRun, run(), run(),
    ])).toThrow(/finite/i);
  });

  it("reports a budget failure without dropping the raw evidence", () => {
    const summary = summarizeAdminEditorialLedgerPerformance([
      run(), run(), run(), run(), { ...run(), routeDataToUsableMs: 1_001 },
    ]);

    expect(summary.passed).toBe(false);
    expect(summary.metrics.routeDataToUsableMs.passed).toBe(false);
    expect(summary.metrics.routeDataToUsableMs.raw).toContain(1_001);
  });
});
