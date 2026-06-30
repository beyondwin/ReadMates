import { test, expect, type Page } from "@playwright/test";

async function loginWithDevShortcut(page: Page, accountName: string | RegExp) {
  await page.goto("/login");
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/api/bff/api/dev/login") && response.status() === 200,
    ),
    page.getByRole("button", { name: accountName }).click(),
  ]);
  await page.waitForURL(/\/(admin|app|clubs)\b/);
}

async function routePlatformAdminHostWorkspace(page: Page) {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        userId: "platform-owner-user",
        membershipId: "membership-host",
        clubId: "club-reading-sai",
        email: "owner@example.com",
        displayName: "OWNER admin",
        accountName: "OWNER admin",
        role: "HOST",
        membershipStatus: "ACTIVE",
        approvalState: "ACTIVE",
        currentMembership: {
          membershipId: "membership-host",
          clubId: "club-reading-sai",
          clubSlug: "reading-sai",
          displayName: "OWNER admin",
          role: "HOST",
          membershipStatus: "ACTIVE",
          approvalState: "ACTIVE",
        },
        joinedClubs: [
          {
            clubId: "club-reading-sai",
            clubSlug: "reading-sai",
            clubName: "읽는사이",
            membershipId: "membership-host",
            role: "HOST",
            status: "ACTIVE",
            primaryHost: null,
          },
        ],
        platformAdmin: { userId: "platform-owner-user", email: "owner@example.com", role: "OWNER" },
        recommendedAppEntryUrl: "/admin",
      }),
    });
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        platformRole: "OWNER",
        activeClubCount: 1,
        domainActionRequiredCount: 0,
        domainsRequiringAction: [],
      }),
    });
  });
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });
  await page.route("**/api/bff/api/admin/ai-generation/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        activeJobCount: 0,
        failedLast24h: 0,
        monthToDateCostEstimateUsd: "0.0000",
        failureCodes: [],
        providerCosts: [],
        staleCandidateCount: 0,
      }),
    });
  });
  await page.route("**/api/bff/api/admin/ai-generation/jobs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextCursor: null }),
    });
  });
  await page.route("**/api/bff/api/admin/today/closing-risks", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema: "admin.today_closing_risks.v1",
        generatedAt: "2026-06-30T00:00:00.000Z",
        items: [],
      }),
    });
  });
  await page.route("**/api/bff/api/sessions/current?clubSlug=reading-sai", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentSession: null }),
    });
  });
  await page.route("**/api/bff/api/host/dashboard?clubSlug=reading-sai", async (route) => {
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
  await page.route("**/api/bff/api/host/sessions?limit=50&clubSlug=reading-sai", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextCursor: null }),
    });
  });
  await page.route("**/api/bff/api/host/club-operations?clubSlug=reading-sai", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema: "host.club_operations_snapshot.v1",
        generatedAt: "2026-06-30T00:00:00.000Z",
        club: { clubId: "club-reading-sai", slug: "reading-sai", name: "읽는사이" },
        readiness: { state: "READY", blockingReasons: [], nextAction: null },
        sessionProgress: {
          upcomingCount: 0,
          currentOpenCount: 0,
          closedCount: 0,
          publishedRecordCount: 0,
          incompleteRecordCount: 0,
        },
        aiUsage: {
          activeJobs: 0,
          failedRecentJobs: 0,
          staleCandidates: 0,
          costEstimateUsd: "0.0000",
          state: "IDLE",
          priorFailedJobs7d: 0,
        },
      }),
    });
  });
  await page.route("**/api/bff/api/host/notifications/summary?clubSlug=reading-sai", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pending: 0, failed: 0, dead: 0, sentLast24h: 0, latestFailures: [] }),
    });
  });
}

test.describe("/admin shell", () => {
  test("admin-owner can navigate the full happy path", async ({ page }) => {
    await loginWithDevShortcut(page, "플랫폼 관리자 · OWNER");
    await page.waitForURL(/\/admin/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/today$/);
    await expect(page.getByRole("heading", { name: /오늘 할 일/ })).toBeVisible();

    await page.getByRole("link", { name: "클럽", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/clubs$/);

    await page.getByRole("banner").getByRole("link", { name: "새 클럽" }).click();
    await expect(page).toHaveURL(/onboarding=1/);
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).not.toHaveURL(/onboarding=1/);
  });

  test("host account is returned to the member app from /admin", async ({ page }) => {
    await loginWithDevShortcut(page, /호스트/);
    await page.waitForURL(/\/app/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/clubs\/reading-sai\/app$/);
    await expect(page.getByRole("heading", { name: /호스트님/ })).toBeVisible();
  });

  test("analytics route renders the ready analytics overview", async ({ page }) => {
    await loginWithDevShortcut(page, "플랫폼 관리자 · OWNER");
    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { name: "분석" })).toBeVisible();
    await expect(page.getByText(/준비 중 · S8/)).toHaveCount(0);
  });

  test("platform admin with host membership can open host workspace from the admin header", async ({ page }) => {
    await loginWithDevShortcut(page, "플랫폼 관리자 · OWNER");
    await routePlatformAdminHostWorkspace(page);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/today$/);

    await page.getByRole("button", { name: "내 공간" }).click();
    await page.getByRole("link", { name: "읽는사이 호스트 공간" }).click();

    await expect(page).toHaveURL(/\/clubs\/reading-sai\/app\/host$/);
    await expect(page.getByRole("heading", { name: "모임 운영" })).toBeVisible();
  });
});
