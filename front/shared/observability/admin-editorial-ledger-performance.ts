export const ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS = {
  decodedJsonBytes: "admin-editorial-ledger-decoded-json-bytes",
  routeDataToUsable: "admin-editorial-ledger-route-data-to-usable",
  filterToRafCommit: "admin-editorial-ledger-filter-to-raf-commit",
  caseSelectionToDocketCommit: "admin-editorial-ledger-case-selection-to-docket-commit",
  pollMergeToRafCommit: "admin-editorial-ledger-poll-merge-to-raf-commit",
  forcedGcHeapDelta: "admin-editorial-ledger-forced-gc-heap-delta",
} as const;

export const ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS = {
  routeDataReady: "admin-editorial-ledger-route-data-ready",
  firstUsable: "admin-editorial-ledger-first-usable-control",
  filterInput: "admin-editorial-ledger-filter-input",
  filterRafCommit: "admin-editorial-ledger-filter-raf-commit",
  caseSelection: "admin-editorial-ledger-case-selection",
  docketCommit: "admin-editorial-ledger-docket-commit",
  pollMerge: "admin-editorial-ledger-poll-merge",
  pollMergeRafCommit: "admin-editorial-ledger-poll-merge-raf-commit",
} as const;

let pendingSelectedCaseId: string | null = null;
let pendingFilterCommit = false;
let pendingPollMerge = false;

function supported(): boolean {
  return typeof globalThis.performance !== "undefined"
    && typeof globalThis.performance.mark === "function"
    && typeof globalThis.performance.measure === "function";
}

function begin(mark: string, measure: string, startTime?: number): void {
  if (!supported()) return;
  performance.clearMarks(mark);
  performance.clearMeasures(measure);
  performance.mark(mark, startTime === undefined ? undefined : { startTime });
}

function commit(start: string, end: string, measure: string): void {
  if (!supported() || performance.getEntriesByName(start, "mark").length === 0) return;
  performance.clearMarks(end);
  performance.mark(end);
  performance.measure(measure, start, end);
  performance.clearMarks(start);
}

export function beginAdminEditorialLedgerRouteCommit(dataReadyAtEpochMs?: number): void {
  if (!supported()) return;
  const startTime = dataReadyAtEpochMs === undefined
    ? undefined
    : Math.max(0, dataReadyAtEpochMs - performance.timeOrigin);
  begin(
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.routeDataReady,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.routeDataToUsable,
    startTime,
  );
}

export function commitAdminEditorialLedgerFirstUsable(): void {
  commit(
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.routeDataReady,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.firstUsable,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.routeDataToUsable,
  );
}

export function beginAdminEditorialLedgerFilterCommit(): void {
  pendingFilterCommit = true;
  begin(
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.filterInput,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.filterToRafCommit,
  );
}

export function commitAdminEditorialLedgerFilterRaf(): void {
  if (!pendingFilterCommit) return;
  pendingFilterCommit = false;
  commit(
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.filterInput,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.filterRafCommit,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.filterToRafCommit,
  );
}

export function beginAdminEditorialLedgerCaseSelection(caseId: string): void {
  pendingSelectedCaseId = caseId;
  begin(
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.caseSelection,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.caseSelectionToDocketCommit,
  );
}

export function commitAdminEditorialLedgerCaseDocket(caseId: string): boolean {
  if (!pendingSelectedCaseId || pendingSelectedCaseId !== caseId) return false;
  pendingSelectedCaseId = null;
  commit(
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.caseSelection,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.docketCommit,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.caseSelectionToDocketCommit,
  );
  return true;
}

export function beginAdminEditorialLedgerPollMerge(): void {
  pendingPollMerge = true;
  begin(
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.pollMerge,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.pollMergeToRafCommit,
  );
}

export function commitAdminEditorialLedgerPollMergeRaf(): void {
  if (!pendingPollMerge) return;
  pendingPollMerge = false;
  commit(
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.pollMerge,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS.pollMergeRafCommit,
    ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.pollMergeToRafCommit,
  );
}

export function resetAdminEditorialLedgerPerformanceStateForTests(): void {
  pendingSelectedCaseId = null;
  pendingFilterCommit = false;
  pendingPollMerge = false;
  if (!supported()) return;
  Object.values(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_MARKS).forEach((name) => performance.clearMarks(name));
  Object.values(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS).forEach((name) => performance.clearMeasures(name));
}
