import { afterEach, describe, expect, it } from "vitest";
import {
  ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS,
  ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS,
  beginAdminEditorialLedgerCaseSelection,
  beginAdminEditorialLedgerFilterCommit,
  beginAdminEditorialLedgerPollMerge,
  beginAdminEditorialLedgerRouteCommit,
  commitAdminEditorialLedgerCaseDocket,
  commitAdminEditorialLedgerFilterRaf,
  commitAdminEditorialLedgerFirstUsable,
  commitAdminEditorialLedgerPollMergeRaf,
  resetAdminEditorialLedgerPerformanceStateForTests,
} from "./admin-editorial-ledger-performance";

afterEach(() => resetAdminEditorialLedgerPerformanceStateForTests());

describe("admin editorial ledger performance observability", () => {
  it("publishes exactly the six approved metrics", () => {
    expect(Object.values(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS)).toEqual([
      "admin-editorial-ledger-decoded-json-bytes",
      "admin-editorial-ledger-route-data-to-usable",
      "admin-editorial-ledger-filter-to-raf-commit",
      "admin-editorial-ledger-case-selection-to-docket-commit",
      "admin-editorial-ledger-poll-merge-to-raf-commit",
      "admin-editorial-ledger-forced-gc-heap-delta",
    ]);
  });

  it("pairs route, filter, and poll marks into named measures", () => {
    beginAdminEditorialLedgerRouteCommit();
    commitAdminEditorialLedgerFirstUsable();
    beginAdminEditorialLedgerFilterCommit();
    commitAdminEditorialLedgerFilterRaf();
    beginAdminEditorialLedgerPollMerge();
    commitAdminEditorialLedgerPollMergeRaf();

    expect(performance.getEntriesByName(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.routeDataReady)).toHaveLength(0);
    expect(performance.getEntriesByName(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.firstUsable)).toHaveLength(1);
    expect(performance.getEntriesByName(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.routeDataToUsable)).toHaveLength(1);
    expect(performance.getEntriesByName(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.filterToRafCommit)).toHaveLength(1);
    expect(performance.getEntriesByName(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.pollMergeToRafCommit)).toHaveLength(1);
  });

  it("commits a docket measurement only when the selected case matches the target", () => {
    beginAdminEditorialLedgerCaseSelection("synthetic-case-02");
    expect(commitAdminEditorialLedgerCaseDocket("synthetic-case-01")).toBe(false);
    expect(commitAdminEditorialLedgerCaseDocket("synthetic-case-02")).toBe(true);
    expect(performance.getEntriesByName(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.caseSelectionToDocketCommit)).toHaveLength(1);
    expect(commitAdminEditorialLedgerCaseDocket("synthetic-case-02")).toBe(false);
  });
});
