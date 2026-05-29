import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";

function platformAdminAuth(role: PlatformAdminRole): AuthMeResponse {
  const email = `${role.toLowerCase()}@example.com`;
  return {
    authenticated: true,
    userId: `platform-${role.toLowerCase()}-user`,
    membershipId: null,
    clubId: null,
    email,
    displayName: `${role} admin`,
    accountName: `${role} admin`,
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: { userId: `platform-${role.toLowerCase()}-user`, email, role },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeAdminClubs(page: Page): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, platformAdminAuth("OWNER"));
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await json(route, 200, {
      platformRole: "OWNER",
      activeClubCount: 2,
      domainActionRequiredCount: 1,
      domains: [],
      domainsRequiringAction: [],
    });
  });
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await json(route, 200, {
      items: [
        {
          clubId: "ok-club", slug: "healthy", name: "Healthy Club",
          tagline: "", about: "", status: "ACTIVE", publicVisibility: "PUBLIC",
          domainCount: 1, domainActionRequiredCount: 0, firstHostOnboardingState: "ASSIGNED",
        },
        {
          clubId: "crit-club", slug: "broken", name: "Broken Club",
          tagline: "", about: "", status: "ACTIVE", publicVisibility: "PRIVATE",
          domainCount: 1, domainActionRequiredCount: 2, firstHostOnboardingState: "ASSIGNED",
        },
      ],
    });
  });
  await page.route("**/api/bff/api/admin/support-access-grants?clubId=*", async (route) => {
    await json(route, 200, [{ id: "grant-1" }]);
  });
  await page.route("**/api/bff/api/admin/clubs/*/operations", async (route) => {
    await json(route, 200, {
      schema: "admin.club_operations_snapshot.v1",
      generatedAt: "2026-05-29T00:00:00Z",
      club: { clubId: "crit-club", slug: "broken", name: "Broken Club", status: "ACTIVE", publicVisibility: "PRIVATE" },
      readiness: { state: "READY", blockingReasons: [], nextAction: null },
      memberActivity: { activeCount: 0, dormantCount: 0, pendingViewerCount: 0, hostCount: 1 },
      sessionProgress: { upcomingCount: 0, currentOpenCount: 0, closedCount: 0, publishedRecordCount: 0, incompleteRecordCount: 0 },
      notificationHealth: { pending: 0, failed: 0, dead: 0, lastSuccessAt: null, failureClusters: [] },
      aiUsage: { activeJobs: 0, failedRecentJobs: 0, staleCandidates: 0, costEstimateUsd: "0.0000", state: "NO_ACTIVITY" },
      safeLinks: [],
    });
  });
}

test.describe("admin clubs triage", () => {
  test("orders at-risk clubs first, filters by severity, and drills into a club", async ({ page }) => {
    await routeAdminClubs(page);

    await page.goto("/admin/clubs");
    await expect(page.getByRole("heading", { name: "클럽" })).toBeVisible();

    // Triage filter toolbar is present.
    await expect(page.getByRole("button", { name: "전체" })).toBeVisible();
    await expect(page.getByRole("button", { name: "긴급" })).toBeVisible();

    // Critical club sorts above the healthy one.
    const rows = page.locator(".admin-clubs__table tbody tr");
    await expect(rows.first()).toContainText("Broken Club");

    // Filtering to 긴급 keeps only the critical club.
    await page.getByRole("button", { name: "긴급" }).click();
    await expect(page.getByText("Broken Club")).toBeVisible();
    await expect(page.getByText("Healthy Club")).toHaveCount(0);

    // Reset to 전체 and drill into the first club row.
    await page.getByRole("button", { name: "전체" }).click();
    const firstClubLink = page.locator(".admin-clubs__table tbody tr td a").first();
    await firstClubLink.click();
    await expect(page).toHaveURL(/\/admin\/clubs\/.+/);
  });
});
