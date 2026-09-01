import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import { HOST_MEETING_PERFORMANCE_METRICS } from "@/shared/observability/host-meeting-performance";
import {
  fulfillHostAuth,
  hostSessionDetailResponse,
  isHostSessionDetailRequest,
  routeHostEditorShell,
  withServerScheduleSeenSummary,
} from "../e2e/aigen-test-fixtures";
import {
  sumDecodedJsonResponseBytes,
  summarizeHostMeetingPerformance,
  type HostMeetingPerformanceRun,
} from "./host-meeting-workspace-budget";

const CLUB_SLUG = "club-a";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const PATH = `/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}`;

function syntheticMeeting(attendanceStatus: "UNKNOWN" | "ABSENT" = "UNKNOWN"): HostSessionDetailResponse {
  const base = hostSessionDetailResponse(SESSION_ID);
  return withServerScheduleSeenSummary({
    ...base,
    title: "500명 합성 성능 모임",
    versions: {
      ...base.versions,
      participantSetRevision: 3,
    },
    attendanceSnapshotId: "synthetic-attendance-snapshot",
    attendees: Array.from({ length: 500 }, (_, index) => ({
      membershipId: `synthetic-member-${index + 1}`,
      avatarKey: "banana-green-book",
      displayName: `합성 독자 ${String(index + 1).padStart(3, "0")}`,
      accountName: `synthetic-${index + 1}`,
      rsvpStatus: index % 4 === 0 ? "NO_RESPONSE" as const : "GOING" as const,
      attendanceStatus: index === 0 ? attendanceStatus : index % 3 === 0 ? "UNKNOWN" as const : "ATTENDED" as const,
      participationStatus: "ACTIVE" as const,
      attendanceRevision: index === 0 && attendanceStatus === "ABSENT" ? 2 : 1,
      seenScheduleRevision: index % 2 === 0 ? 1 : null,
      scheduleSeenAt: index % 2 === 0 ? "2026-08-29T01:02:03Z" : null,
      scheduleSeenState: index % 2 === 0 ? "CURRENT" as const : "UNSEEN" as const,
    })),
  });
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeWorkspace(page: Page): Promise<void> {
  let saved = false;
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
  await routeHostEditorShell(page, CLUB_SLUG);
  await page.route("**/api/observability/frontend-events", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/bff/api/auth/me**", (route) => fulfillHostAuth(route, CLUB_SLUG));
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/publication/convergence**`, (route) => route.fulfill({ status: 204 }));
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/attendance**`, async (route) => {
    saved = true;
    await json(route, { sessionId: SESSION_ID, count: 1 });
  });
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    if (!isHostSessionDetailRequest(route, SESSION_ID)) return route.fallback();
    await json(route, syntheticMeeting(saved ? "ABSENT" : "UNKNOWN"));
  });
}

async function measure(page: Page, name: string): Promise<number> {
  await page.waitForFunction((entryName) => performance.getEntriesByName(entryName, "measure").length > 0, name);
  const value = await page.evaluate((entryName) => performance.getEntriesByName(entryName, "measure").at(-1)?.duration, name);
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Missing finite performance measure: ${name}`);
  return value;
}

test("five cold 500-member runs stay within the host workspace budgets", async ({ browser }) => {
  const runs: HostMeetingPerformanceRun[] = [];

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
    await routeWorkspace(page);

    await page.goto(`${PATH}?section=overview`);
    const routeDataToUsableMs = await measure(page, HOST_MEETING_PERFORMANCE_METRICS.routeDataToUsable);

    await cdp.send("HeapProfiler.collectGarbage");
    const heapBefore = await cdp.send("Runtime.getHeapUsage");
    await page
      .getByRole("navigation", { name: "관련 작업" })
      .getByRole("link", { name: "참석 응답", exact: true })
      .click();
    const responsesSheet = page.getByRole("dialog", { name: "참석 응답" });
    await expect(responsesSheet).toBeVisible();
    const responseRows = responsesSheet.locator(".rm-meeting-response-ledger__row");
    await expect(responseRows).toHaveCount(500);
    await cdp.send("HeapProfiler.collectGarbage");
    const heapAfter = await cdp.send("Runtime.getHeapUsage");
    const decodedResponses = await page.evaluate(() => (
      window as unknown as { __readmatesDecodedJsonResponses: Array<{ url: string; status: number; contentType: string; text: string }> }
    ).__readmatesDecodedJsonResponses);
    const decodedJsonBytes = sumDecodedJsonResponseBytes(decodedResponses);

    await responsesSheet.getByRole("searchbox", { name: "참여자 검색" }).fill("합성 독자 500");
    await expect(responseRows).toHaveCount(1);
    const inputToRafCommitMs = await measure(page, HOST_MEETING_PERFORMANCE_METRICS.inputToRafCommit);

    await responsesSheet.getByRole("searchbox", { name: "참여자 검색" }).fill("");
    await expect(responseRows).toHaveCount(500);
    await responsesSheet
      .getByRole("combobox", { name: "합성 독자 001 실제 출석" })
      .selectOption("ABSENT");
    const authoritativeSaveToRowCommitMs = await measure(
      page,
      HOST_MEETING_PERFORMANCE_METRICS.authoritativeSaveToRowCommit,
    );

    runs.push({
      syntheticMemberCount: 500,
      decodedJsonBytes,
      routeDataToUsableMs,
      inputToRafCommitMs,
      authoritativeSaveToRowCommitMs,
      forcedGcHeapDeltaBytes: heapAfter.usedSize - heapBefore.usedSize,
    });
    await context.close();
  }

  const summary = summarizeHostMeetingPerformance(runs);
  const outputDirectory = path.resolve("output/performance");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "host-meeting-workspace-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  expect(summary.passed, JSON.stringify(summary, null, 2)).toBe(true);
});
