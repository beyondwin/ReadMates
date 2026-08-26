import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import type {
  AdminOperationCase,
  AdminOperationCaseDetailResponse,
  AdminOperationCasesResponse,
  AdminOperationSourceType,
  AdminOperationSummaryCode,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import { ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS } from "@/shared/observability/admin-editorial-ledger-performance";
import {
  TODAY_VIEW_CAPABILITIES,
  routeAdminEditorialLedgerShell,
} from "../e2e/admin-editorial-ledger-e2e-fixtures";
import {
  sumDecodedJsonResponseBytes,
  summarizeAdminEditorialLedgerPerformance,
  type AdminEditorialLedgerPerformanceRun,
} from "./admin-editorial-ledger-budget";

const CASE_COUNT = 100;
const GENERATED_AT = "2026-08-26T10:00:00Z";
const POLL_GENERATED_AT = "2026-08-26T10:00:15Z";

const SOURCE_CYCLE = [
  "NOTIFICATION",
  "AI_JOB",
  "CLUB_READINESS",
  "CLOSING_RISK",
] as const satisfies readonly AdminOperationSourceType[];

const SUMMARY_BY_SOURCE: Record<AdminOperationSourceType, AdminOperationSummaryCode> = {
  NOTIFICATION: "NOTIFICATION_DELIVERY_FAILURE",
  AI_JOB: "AI_JOB_FAILED",
  CLUB_READINESS: "CLUB_SETUP_REQUIRED",
  CLOSING_RISK: "SESSION_CLOSING_BLOCKED",
};

function syntheticCase(index: number, generatedAt: string, extra = 0): AdminOperationCase {
  const sourceType = SOURCE_CYCLE[index % SOURCE_CYCLE.length];
  return {
    id: `synthetic-case-${String(index + 1).padStart(3, "0")}`,
    sourceType,
    clubId: null,
    state: "OPEN",
    severity: index % 11 === 0 ? "CRITICAL" : "WARNING",
    summaryCode: SUMMARY_BY_SOURCE[sourceType],
    firstObservedAt: "2026-08-26T08:00:00Z",
    lastObservedAt: generatedAt,
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: index % 5 === 0,
    reopenCount: 0,
    version: 1 + extra,
    impactCount: 1 + extra,
    detailHref: "/admin/notifications",
    allowedActions: ["ACKNOWLEDGE"],
    source: {
      sourceType,
      status: "AVAILABLE",
      generatedAt,
      lastSuccessfulAt: generatedAt,
      authoritative: true,
    },
  };
}

function listResponse(generatedAt: string, extra = 0, extraCase = false): AdminOperationCasesResponse {
  const items = Array.from({ length: CASE_COUNT }, (_, index) => syntheticCase(index, generatedAt, extra));
  if (extraCase) {
    items.push({
      ...syntheticCase(CASE_COUNT, generatedAt, extra),
      id: "synthetic-case-pending",
      severity: "CRITICAL",
      summaryCode: "NOTIFICATION_PLATFORM_BACKLOG",
      sourceType: "NOTIFICATION",
      source: {
        sourceType: "NOTIFICATION",
        status: "AVAILABLE",
        generatedAt,
        lastSuccessfulAt: generatedAt,
        authoritative: true,
      },
    });
  }
  return {
    schema: "admin.operation_cases.v1",
    generatedAt,
    counts: {
      open: items.length,
      critical: items.filter((item) => item.severity === "CRITICAL").length,
      assignedToMe: items.filter((item) => item.assignedToMe).length,
      snoozed: 0,
    },
    sources: SOURCE_CYCLE.map((sourceType) => ({
      sourceType,
      status: "AVAILABLE" as const,
      generatedAt,
      lastSuccessfulAt: generatedAt,
      authoritative: true,
    })),
    items,
    nextCursor: null,
  };
}

function detailResponse(item: AdminOperationCase): AdminOperationCaseDetailResponse {
  return {
    schema: "admin.operation_cases.v1",
    item,
    history: [{
      fromState: null,
      toState: "OPEN",
      action: null,
      reasonCode: "SIGNAL_OPENED",
      occurredAt: "2026-08-26T08:00:00Z",
      caseVersion: 1,
    }],
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeLedger(page: Page): Promise<{ setGeneration: (generation: 1 | 2) => void }> {
  let generation: 1 | 2 = 1;
  await page.addInitScript(() => {
    const target = window as unknown as { __readmatesDecodedJsonResponses: Array<{ url: string; status: number; contentType: string; text: string }> };
    target.__readmatesDecodedJsonResponses = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const contentType = response.headers.get("content-type") ?? "";
      if (response.status !== 204 && /(?:application\/json|\+json)(?:;|$)/i.test(contentType)) {
        const url = new URL(response.url || String(args[0]), window.location.href);
        if (url.pathname.startsWith("/api/")) {
          target.__readmatesDecodedJsonResponses.push({
            url: url.pathname,
            status: response.status,
            contentType,
            text: await response.clone().text(),
          });
        }
      }
      return response;
    };
  });
  await routeAdminEditorialLedgerShell(page, { capabilities: TODAY_VIEW_CAPABILITIES });
  await page.route("**/api/observability/frontend-events", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/bff/api/admin/operations/cases**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const generatedAt = generation === 1 ? GENERATED_AT : POLL_GENERATED_AT;
    const extra = generation === 1 ? 0 : 1;
    const list = listResponse(generatedAt, extra, generation === 2);
    if (pathname === "/api/bff/api/admin/operations/cases") {
      await json(route, list);
      return;
    }
    const caseId = pathname.split("/").at(-1) ?? "";
    const item = list.items.find((entry) => entry.id === caseId) ?? syntheticCase(0, generatedAt, extra);
    await json(route, detailResponse({ ...item, id: caseId }));
  });
  return {
    setGeneration: (next) => {
      generation = next;
    },
  };
}

async function measure(page: Page, name: string): Promise<number> {
  await page.waitForFunction((entryName) => performance.getEntriesByName(entryName, "measure").length > 0, name);
  const value = await page.evaluate((entryName) => performance.getEntriesByName(entryName, "measure").at(-1)?.duration, name);
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Missing finite performance measure: ${name}`);
  return value;
}

function waitForCasesList(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/bff/api/admin/operations/cases" && response.request().method() === "GET";
  }, { timeout: 20_000 });
}

test("five cold 100-case runs stay within the admin editorial ledger budgets", async ({ browser }) => {
  test.setTimeout(360_000);
  const runs: AdminEditorialLedgerPerformanceRun[] = [];

  for (let runNumber = 1; runNumber <= 5; runNumber += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 40,
      downloadThroughput: 1_250_000,
      uploadThroughput: 625_000,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("HeapProfiler.enable");
    const routed = await routeLedger(page);

    await page.goto("/admin/today");
    const routeDataToUsableMs = await measure(page, ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.routeDataToUsable);

    await cdp.send("HeapProfiler.collectGarbage");
    const heapBefore = await cdp.send("Runtime.getHeapUsage");
    await expect(page.locator(".admin-operations-queue__row")).toHaveCount(CASE_COUNT);
    await cdp.send("HeapProfiler.collectGarbage");
    const heapAfter = await cdp.send("Runtime.getHeapUsage");

    await page.getByRole("searchbox", { name: "이미 불러온 사건 검색" }).fill("AI 작업");
    await expect(page.locator(".admin-operations-queue__row")).toHaveCount(25);
    const filterToRafCommitMs = await measure(page, ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.filterToRafCommit);

    await page.getByRole("searchbox", { name: "이미 불러온 사건 검색" }).fill("");
    await expect(page.locator(".admin-operations-queue__row")).toHaveCount(CASE_COUNT);
    await page.locator(".admin-operations-queue__row").nth(1).click();
    const caseSelectionToDocketCommitMs = await measure(
      page,
      ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.caseSelectionToDocketCommit,
    );

    routed.setGeneration(2);
    const pollList = waitForCasesList(page);
    await pollList;
    await expect(page.getByRole("button", { name: /새 항목 1개 적용/ })).toBeVisible();
    const pollMergeToRafCommitMs = await measure(page, ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.pollMergeToRafCommit);

    const decodedResponses = await page.evaluate(() => (
      window as unknown as { __readmatesDecodedJsonResponses: Array<{ url: string; status: number; contentType: string; text: string }> }
    ).__readmatesDecodedJsonResponses);
    const decodedJsonBytes = sumDecodedJsonResponseBytes(decodedResponses);

    runs.push({
      syntheticCaseCount: CASE_COUNT,
      decodedJsonBytes,
      routeDataToUsableMs,
      filterToRafCommitMs,
      caseSelectionToDocketCommitMs,
      pollMergeToRafCommitMs,
      forcedGcHeapDeltaBytes: Math.max(0, heapAfter.usedSize - heapBefore.usedSize),
    });
    await context.close();
  }

  const summary = summarizeAdminEditorialLedgerPerformance(runs);
  const outputDirectory = path.resolve("output/performance");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "admin-editorial-ledger-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  expect(summary.passed, JSON.stringify(summary, null, 2)).toBe(true);
  expect(JSON.stringify(summary)).not.toMatch(/synthetic-case|club-|@|https?:\/\//);
});
