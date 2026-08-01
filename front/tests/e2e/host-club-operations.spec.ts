import { expect, test, type Page } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  cleanupGeneratedSessions();
  createOpenSessionFixture();
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
  cleanupGeneratedSessions();
  resetSeedGoogleLogins(["host@example.com"]);
});

async function routeHostClubOperations(page: Page): Promise<void> {
  await page.route("**/api/bff/api/host/club-operations", async (route) => {
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
  await page.route("**/api/bff/api/host/dashboard", async (route) => {
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

async function expectNoHostPrivateSentinels(page: Page): Promise<void> {
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

async function expectHostOperatingSignalCardPublicSafe(page: Page): Promise<void> {
  const card = page.getByRole("region", { name: "운영 신호" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "운영 신호" })).toBeVisible();
  await expect(card.getByText("READY")).toBeVisible();
  await expect(card.getByText("마감 대기 중인 세션 기록이 있습니다. 공개 전 기록 완성을 먼저 확인하세요.")).toBeVisible();
  await expect(card.getByText("열린 세션")).toBeVisible();
  await expect(card.getByText("AI 실패", { exact: true })).toBeVisible();
  await expect(card.getByText("전주 대비")).toBeVisible();
  await expect(card.getByRole("link", { name: "세션 문서 열기" })).toBeVisible();
  await expect(card.getByRole("link", { name: "알림 장부 보기" })).toBeVisible();
  await expectNoHostPrivateSentinels(page);
}

async function expectHostMobilePriorityLedgerPublicSafe(page: Page): Promise<void> {
  const mobileDashboard = page.locator("main.rm-host-dashboard-mobile");
  await expect(mobileDashboard.getByRole("heading", { name: "모임 운영" })).toBeVisible();
  await expect(mobileDashboard.getByRole("heading", { name: "지금 처리할 일" })).toBeVisible();
  await expect(mobileDashboard.getByRole("heading", { name: "현재 세션", exact: true })).toBeVisible();
  await expect(mobileDashboard.getByText("확인할 운영 항목")).toBeVisible();
  await expect(mobileDashboard.getByRole("heading", { name: "예정 세션", exact: true })).toBeVisible();
  await expect(mobileDashboard.getByRole("heading", { name: "운영 흐름", exact: true })).toBeVisible();
  await expect(mobileDashboard.getByText("운영 도구", { exact: true })).toBeVisible();
  await expectNoHostPrivateSentinels(page);
}

test("host dashboard renders read-only operating-signal card without leaking admin-only signals", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);

  await page.goto("/app/host");
  await expect(
    page.locator("main.rm-host-dashboard-desktop").getByRole("heading", { name: "모임 운영" }),
  ).toBeVisible();

  await expectHostOperatingSignalCardPublicSafe(page);
});

test("host dashboard keeps operating-signal actions inside the scoped club workspace", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);

  await page.goto("/clubs/reading-sai/app/host");

  const card = page.getByRole("region", { name: "운영 신호" });
  await expect(card.getByRole("link", { name: "세션 문서 열기" })).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app/host/sessions/new",
  );
  await expect(card.getByRole("link", { name: "알림 장부 보기" })).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app/host/notifications",
  );
});

test("host dashboard captures public-safe operating-signal and priority-ledger visual evidence", async ({ page }, testInfo) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/host");
  await expectHostOperatingSignalCardPublicSafe(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("host-dashboard-operating-signal-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/host");
  await expectHostMobilePriorityLedgerPublicSafe(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("host-dashboard-operating-signal-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);
});

test("host current-session card keeps balanced metrics at 320px", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/clubs/reading-sai/app/host");

  const mobile = page.locator("main.rm-host-dashboard-mobile");
  const card = mobile.getByRole("article", { name: "현재 세션 요약" });
  const head = card.locator(".rm-host-dashboard-mobile__session-head");
  const metrics = card.locator(".rm-host-dashboard-mobile__session-metrics");
  const cta = card.getByRole("link", { name: "세션 문서 열기" });

  await expect(head).toHaveCSS("padding-left", "18px");
  await expect(head).toHaveCSS("padding-right", "18px");
  await expect(head).toHaveCSS("padding-top", "18px");
  await expect(head).toHaveCSS("padding-bottom", "16px");
  await expect(metrics.locator(":scope > div")).toHaveCount(3);
  expect(await metrics.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(3);
  await expect(cta).toHaveCSS("height", "48px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
