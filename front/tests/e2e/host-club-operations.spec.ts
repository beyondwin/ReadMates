import { expect, test, type Page } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const HOST_DASHBOARD_FIXED_TIME = new Date("2026-08-01T12:00:00+09:00");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(HOST_DASHBOARD_FIXED_TIME);
  cleanupGeneratedSessions();
  createOpenSessionFixture();
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
  cleanupGeneratedSessions();
  resetSeedGoogleLogins(["host@example.com"]);
});

function matchesExactBffUrl(
  url: URL,
  pathname: string,
  allowedSearchParams: ReadonlyArray<Readonly<Record<string, string>>>,
): boolean {
  if (url.pathname !== pathname) {
    return false;
  }

  return allowedSearchParams.some((expected) => {
    const entries = Array.from(url.searchParams.entries());
    return entries.length === Object.keys(expected).length
      && Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);
  });
}

async function routeHostClubOperations(page: Page): Promise<void> {
  await page.route((url) => matchesExactBffUrl(
    url,
    "/api/bff/api/host/club-operations",
    [{}, { clubSlug: "reading-sai" }],
  ), async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema: "host.club_operations_snapshot.v1",
        generatedAt: "2026-05-31T00:00:00Z",
        club: { clubId: "club-1", slug: "club-one", name: "Club One" },
        readiness: { state: "READY", blockingReasons: [], nextAction: null },
        sessionProgress: {
          upcomingCount: 1,
          currentOpenCount: 1,
          closedCount: 4,
          publishedRecordCount: 3,
          incompleteRecordCount: 1,
        },
        aiUsage: {
          activeJobs: 1,
          failedRecentJobs: 3,
          staleCandidates: 0,
          costEstimateUsd: "0.5000",
          state: "DEGRADED",
          priorFailedJobs7d: 1,
        },
      }),
    });
  });
}

async function routeHostDashboardPublicSafe(page: Page): Promise<void> {
  await page.route((url) => matchesExactBffUrl(
    url,
    "/api/bff/api/host/dashboard",
    [{}, { clubSlug: "reading-sai" }],
  ), async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rsvpPending: 0,
        checkinMissing: 0,
        publishPending: 0,
        feedbackPending: 0,
        currentSessionMissingMemberCount: 0,
        currentSessionMissingMembers: [],
      }),
    });
  });
}

async function routeEmptyCurrentSession(page: Page): Promise<void> {
  await page.route((url) => matchesExactBffUrl(
    url,
    "/api/bff/api/sessions/current",
    [{}, { clubSlug: "reading-sai" }],
  ), async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentSession: null }),
    });
  });
}

async function expectNoHostPrivateSentinels(page: Page): Promise<void> {
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

async function expectHostMeetingLedgerPublicSafe(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /지금 다루는 모임|아직 열린 모임이 없습니다/ })).toBeVisible();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expectNoHostPrivateSentinels(page);
}

test("host home renders the meeting ledger without leaking admin-only signals", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);

  await page.goto("/app/host");
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/app\/host(\/sessions\/[^/]+)?$/);
  await expectHostMeetingLedgerPublicSafe(page);
});

test("host home keeps meeting actions inside the scoped club workspace", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);

  await page.goto("/clubs/reading-sai/app/host");
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/clubs\/reading-sai\/app\/host(\/sessions\/[^/]+)?$/);
  await expectHostMeetingLedgerPublicSafe(page);
  await expect(page.getByRole("link", { name: "멤버 화면으로" }).first()).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app",
  );
});

test("host meeting ledger captures public-safe visual evidence", async ({ page }, testInfo) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);

  for (const viewport of [
    { name: "mobile-320", width: 320, height: 844 },
    { name: "mobile-390", width: 390, height: 844 },
    { name: "tablet-768", width: 768, height: 1024 },
    { name: "desktop-1280", width: 1280, height: 720 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/clubs/reading-sai/app/host");
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/clubs\/reading-sai\/app\/host(\/sessions\/[^/]+)?$/);
    await expectHostMeetingLedgerPublicSafe(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const screenshot = await page.screenshot({
      path: testInfo.outputPath(`host-dashboard-${viewport.name}.png`),
      fullPage: true,
    });
    expect(screenshot.byteLength).toBeGreaterThan(10_000);
  }
});

test("host operations hub stays public-safe without the retired dashboard page", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostClubOperations(page);

  await page.goto("/clubs/reading-sai/app/host/operations");
  await expect(page.getByRole("heading", { name: "운영 허브" })).toBeVisible();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expectNoHostPrivateSentinels(page);
});

test("host empty meeting ledger stays public-safe at 320px", async ({ page }, testInfo) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);
  await routeEmptyCurrentSession(page);
  await page.route((url) => matchesExactBffUrl(
    url,
    "/api/bff/api/host/sessions",
    [{ limit: "50" }, { limit: "50", clubSlug: "reading-sai" }],
  ), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextCursor: null }),
    });
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/clubs/reading-sai/app/host");

  await expect(page.getByRole("heading", { name: "아직 열린 모임이 없습니다" })).toBeVisible();
  await expect(page.getByRole("link", { name: "첫 모임 만들기" })).toBeVisible();
  await expectNoHostPrivateSentinels(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const screenshot = await page.screenshot({
    path: testInfo.outputPath("host-dashboard-empty-320x844.png"),
    fullPage: true,
  });
  expect(screenshot.byteLength).toBeGreaterThan(10_000);
});
