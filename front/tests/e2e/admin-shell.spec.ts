import { test, expect, type Page } from "@playwright/test";

const OWNER_CAPABILITIES = [
  "VIEW_TODAY",
  "VIEW_CLUBS",
  "VIEW_CLUB_OPERATIONS",
  "VIEW_SERVICE_HEALTH",
  "VIEW_NOTIFICATION_OPERATIONS",
  "REPLAY_NOTIFICATIONS",
  "VIEW_AI_OPERATIONS",
  "MANAGE_AI_OPERATIONS",
  "EMERGENCY_PUBLIC_TAKEDOWN",
  "VIEW_SUPPORT",
  "MANAGE_SUPPORT_ACCESS",
  "VIEW_AUDIT",
  "VIEW_SENSITIVE_AUDIT",
  "VIEW_ANALYTICS",
  "EXPORT_ANALYTICS",
  "CREATE_CLUB",
  "MANAGE_CLUBS",
  "MANAGE_CLUB_DOMAINS",
  "MANAGE_PLATFORM_ADMINS",
] as const;

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

async function routePlatformAdminCapabilities(page: Page) {
  await page.route("**/api/bff/api/admin/capabilities**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        role: "OWNER",
        status: "ACTIVE",
        capabilities: [...OWNER_CAPABILITIES],
        generatedAt: "2026-08-22T00:00:00Z",
      }),
    });
  });
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
            approvalState: "ACTIVE",
            primaryHost: null,
          },
        ],
        availableSpaces: {
          version: 1,
          kinds: ["PLATFORM", "CLUBS"],
          clubs: [
            {
              clubId: "club-reading-sai",
              clubSlug: "reading-sai",
              clubName: "읽는사이",
              perspectives: ["MEMBER", "HOST"],
            },
          ],
        },
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
  await page.route("**/api/bff/api/admin/operations/cases**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema: "admin.operation_cases.v1",
        generatedAt: "2026-08-04T10:00:00Z",
        counts: { open: 0, critical: 0, assignedToMe: 0, snoozed: 0 },
        sources: [],
        items: [],
        nextCursor: null,
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
  await page.route("**/api/bff/api/host/operating-room/current?clubSlug=reading-sai", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentMeeting: null }),
    });
  });
  await page.route("**/api/bff/api/host/workbox?**", async (route) => {
    const state = new URL(route.request().url()).searchParams.get("state") ?? "NOW";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        state,
        evaluatedAt: "2026-08-29T01:02:03Z",
        sourceAvailability: [
          { type: "SCHEDULE_UNSEEN", state: "AVAILABLE" },
          { type: "MEMBER_APPROVAL", state: "AVAILABLE" },
          { type: "RECORD_CLOSING", state: "AVAILABLE" },
          { type: "INVITATION_EXPIRY", state: "AVAILABLE" },
          { type: "NOTIFICATION_FAILURE", state: "AVAILABLE" },
        ],
        items: [],
        nextCursor: null,
      }),
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
  await page.route("**/api/bff/api/host/operating-room/current?clubSlug=reading-sai", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentMeeting: null }),
    });
  });
  await page.route("**/api/bff/api/host/sessions?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        nextCursor: null,
        summary: { needsAttentionCount: 0, incompletePublishedCount: 0, draftCount: 0 },
      }),
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

function adminShellSuite() {
  test("admin-owner can navigate the full happy path", async ({ page }) => {
    await routePlatformAdminCapabilities(page);
    await loginWithDevShortcut(page, "플랫폼 관리자 · OWNER");
    await page.waitForURL(/\/admin/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/today(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "오늘의 운영 케이스" })).toBeVisible();
    await expect(page.getByRole("link", { name: "오늘 할 일", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "클럽 관리", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "서비스 상태", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "처리 기록", exact: true })).toBeVisible();
    await expect(page.getByText("Command")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "사건" })).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: "새 클럽" })).toHaveCount(0);

    await page.getByRole("link", { name: "클럽 관리", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/clubs$/);

    await page.getByRole("main").getByRole("link", { name: "새 클럽" }).click();
    await expect(page).toHaveURL(/onboarding=1/);
    await expect(page.getByRole("dialog")).toBeVisible();

    const closeButton = page.getByRole("button", { name: "닫기" });
    await expect(closeButton).toBeFocused();
    await closeButton.click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).not.toHaveURL(/onboarding=1/);
  });

  test("analytics route renders the ready analytics overview", async ({ page }) => {
    await routePlatformAdminCapabilities(page);
    await loginWithDevShortcut(page, "플랫폼 관리자 · OWNER");
    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { name: "분석 부록" })).toBeVisible();
    await expect(page.getByText(/준비 중 · S8/)).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "현재 위치" }),
    ).toContainText("분석 부록");
  });

  test("platform admin with host membership can open host workspace from the admin header", async ({ page }) => {
    await routePlatformAdminCapabilities(page);
    await loginWithDevShortcut(page, "플랫폼 관리자 · OWNER");
    await routePlatformAdminHostWorkspace(page);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/today$/);

    await page.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" }).click();
    await page.getByRole("menuitem", { name: "내 클럽" }).click();
    await page.getByRole("menuitemradio", { name: "읽는사이 호스트로 운영" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toMatch(
      /\/clubs\/reading-sai\/app\/host(\/sessions\/[^/]+)?$/,
    );
    expect(new URL(page.url()).pathname).not.toMatch(/\/edit\/?$/);
    await expect(page.getByRole("heading", { name: /지금 다루는 모임|현재 운영할 모임이 없습니다/ })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "클럽 작업함" })).toBeVisible();
  });
}

test.describe("/admin shell", () => {
  test.describe("desktop", () => {
    test.use({ viewport: { width: 1280, height: 800 } });
    adminShellSuite();
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    adminShellSuite();
  });

  test("host account is returned to the member app from /admin", async ({ page }) => {
    await loginWithDevShortcut(page, /호스트/);
    await page.waitForURL(/\/app/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/clubs\/reading-sai\/app$/);
    await expect(page.getByRole("heading", { name: /호스트님/ })).toBeVisible();
  });
});
