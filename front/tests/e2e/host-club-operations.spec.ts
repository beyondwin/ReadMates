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

async function routeHostSessionsPublicSafe(page: Page): Promise<void> {
  await page.route((url) => matchesExactBffUrl(
    url,
    "/api/bff/api/host/sessions",
    [{ limit: "50" }, { limit: "50", clubSlug: "reading-sai" }],
  ), async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{
          sessionId: "e2e-upcoming-session",
          sessionNumber: 8,
          title: "8회차 모임 · E2E 예정 세션 책",
          bookTitle: "E2E 예정 세션 책",
          bookAuthor: "테스트 저자",
          bookImageUrl: null,
          date: "2026-08-20",
          startTime: "20:00",
          endTime: "22:00",
          locationLabel: "온라인",
          state: "DRAFT",
          visibility: "HOST_ONLY",
          recordStatus: "INCOMPLETE",
          needsAttention: false,
          hasDraft: false,
          liveRevision: 0,
          draftRevision: null,
          lastModifiedAt: null,
        }],
        nextCursor: null,
      }),
    });
  });
}

async function routeHostNotificationSummaryWithFailures(page: Page): Promise<void> {
  await page.route((url) => matchesExactBffUrl(
    url,
    "/api/bff/api/host/notifications/summary",
    [{}, { clubSlug: "reading-sai" }],
  ), async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pending: 2,
        failed: 1,
        dead: 1,
        sentLast24h: 5,
        latestFailures: [{
          id: "notification-failed-1",
          eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
          recipientEmail: "member@example.com",
          attemptCount: 3,
          updatedAt: "2026-05-31T00:00:00Z",
        }],
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

async function expectHostMobileNotificationSummaryLayout(
  page: Page,
  { withFailureDetails = false }: { withFailureDetails?: boolean } = {},
): Promise<void> {
  const mobileDashboard = page.locator("main.rm-host-dashboard-mobile");
  const tools = mobileDashboard
    .getByText("운영 도구", { exact: true })
    .locator("xpath=ancestor::details");
  await tools.locator("summary").click();

  const notifications = tools.getByRole("region", { name: "알림 발송" });
  const heading = notifications.getByRole("heading", { name: "알림 발송" });
  const headerMeta = notifications.getByText(/최근 24시간 \d+건/);
  expect(await heading.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
    .toBeGreaterThanOrEqual(17);
  await expect(headerMeta).toHaveCSS("white-space", "nowrap");
  expect(await headerMeta.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
    .toBeGreaterThanOrEqual(12);

  const metrics = notifications.locator(".rm-host-mobile-notifications__metrics");
  const metricCells = metrics.locator(":scope > div");
  await expect(metricCells).toHaveCount(3);
  expect(
    await metrics.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
  ).toBe(3);
  const metricBoxes = await metricCells.evaluateAll((cells) => (
    cells.map((cell) => {
      const rect = cell.getBoundingClientRect();
      return { width: rect.width, top: rect.top };
    })
  ));
  expect(Math.max(...metricBoxes.map(({ width }) => width)) - Math.min(...metricBoxes.map(({ width }) => width)))
    .toBeLessThanOrEqual(1);
  expect(new Set(metricBoxes.map(({ top }) => Math.round(top))).size).toBe(1);
  for (const label of await metrics.locator("dt").all()) {
    expect(await label.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
      .toBeGreaterThanOrEqual(12);
  }
  await expect(notifications).toHaveCSS("border-top-width", "0px");
  await expect(notifications).toHaveCSS("border-bottom-width", "0px");

  if (withFailureDetails) {
    const failureDetails = [
      notifications.getByText("FEEDBACK_DOCUMENT_PUBLISHED"),
      notifications.getByText("m***@example.com"),
      notifications.getByText("3회 시도"),
    ];
    for (const detail of failureDetails) {
      expect(await detail.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
        .toBeGreaterThanOrEqual(14);
    }
  }

  const ledgerLink = notifications.getByRole("link", { name: "알림 발송 장부 열기" });
  const ledgerLinkBox = await ledgerLink.boundingBox();
  expect(ledgerLinkBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await ledgerLink.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
    .toBeGreaterThanOrEqual(14);
  expect(await notifications.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

test("host dashboard renders read-only operating-signal card without leaking admin-only signals", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);
  await routeHostSessionsPublicSafe(page);

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
  await routeHostSessionsPublicSafe(page);

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
  await routeHostSessionsPublicSafe(page);

  for (const viewport of [
    { name: "mobile-320", width: 320, height: 844 },
    { name: "mobile-390", width: 390, height: 844 },
    { name: "tablet-768", width: 768, height: 1024 },
    { name: "desktop-1280", width: 1280, height: 720 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/clubs/reading-sai/app/host");

    if (viewport.width <= 768) {
      await expectHostMobilePriorityLedgerPublicSafe(page);
      await expect(page.getByRole("article", { name: "현재 세션 요약" })).toBeVisible();
      await expectHostMobileNotificationSummaryLayout(page);
    } else {
      await expectHostOperatingSignalCardPublicSafe(page);
    }

    if (viewport.name === "mobile-390") {
      const disclosure = page.getByText("확인할 운영 항목").locator("xpath=ancestor::details");
      const summary = disclosure.locator("summary");
      await summary.focus();
      await expect(summary).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(disclosure).toHaveAttribute("open", "");

      const currentAction = page.getByRole("link", { name: "세션 문서 열기" });
      await currentAction.focus();
      await expect(currentAction).toBeFocused();
      const actionBox = await currentAction.boundingBox();
      expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);

      const upcomingSection = page
        .locator("main.rm-host-dashboard-mobile")
        .getByRole("region", { name: "예정 세션", exact: true });
      for (const action of [
        upcomingSection.getByRole("link", {
          name: "세션 문서 만들기",
          exact: true,
        }),
        upcomingSection.getByRole("button", {
          name: "E2E 예정 세션 책 게스트 접근을 게스트 공개로 변경",
          exact: true,
        }),
        upcomingSection.getByRole("link", {
          name: "세션 편집 · E2E 예정 세션 책",
          exact: true,
        }),
      ]) {
        await action.focus();
        await expect(action).toBeFocused();
        const box = await action.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const screenshot = await page.screenshot({
      path: testInfo.outputPath(`host-dashboard-${viewport.name}.png`),
      fullPage: true,
    });
    expect(screenshot.byteLength).toBeGreaterThan(10_000);
  }
});

test("host current-session card keeps balanced metrics at 320px", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);
  await routeHostSessionsPublicSafe(page);
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

test("host mobile notification summary keeps active states and failures readable at 320px", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);
  await routeHostSessionsPublicSafe(page);
  await routeHostNotificationSummaryWithFailures(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/clubs/reading-sai/app/host");

  await expectHostMobileNotificationSummaryLayout(page, { withFailureDetails: true });
  const notifications = page.getByRole("region", { name: "알림 발송" });
  await expect(notifications.getByText("최근 24시간 5건")).toBeVisible();
  await expect(notifications.locator('[data-status="pending"]')).toContainText("대기2");
  await expect(notifications.locator('[data-status="failed"]')).toContainText("실패1");
  await expect(notifications.locator('[data-status="dead"]')).toContainText("중단1");
  await expect(notifications.getByText("FEEDBACK_DOCUMENT_PUBLISHED")).toBeVisible();
  await expect(notifications.getByText("m***@example.com")).toBeVisible();
  await expect(page.getByText("member@example.com")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
