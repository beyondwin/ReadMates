import { expect, test, type Page, type Route } from "@playwright/test";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

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

async function routePlatformAdminShell(page: Page, role: PlatformAdminRole): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, platformAdminAuth(role));
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await json(route, 200, {
      platformRole: role,
      activeClubCount: 1,
      domainActionRequiredCount: 0,
      domains: [],
      domainsRequiringAction: [],
    });
  });
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await json(route, 200, { items: [] });
  });
}

function overview(windowValue: "7d" | "30d" | "90d") {
  return {
    schema: "admin.analytics_overview.v1",
    generatedAt: "2026-05-30T00:00:00Z",
    window: windowValue,
    kpis: [
      { key: "SESSION_COMPLETION", unit: "PERCENT", availability: "AVAILABLE", current: windowValue === "7d" ? 70 : 80, prior: 50, deltaDirection: "UP" },
      { key: "RSVP_RATE", unit: "PERCENT", availability: "NOT_ENOUGH_DATA", current: null, prior: null, deltaDirection: "NONE" },
      { key: "ACTIVE_MEMBERS", unit: "COUNT", availability: "AVAILABLE", current: 12, prior: 9, deltaDirection: "UP" },
      { key: "AI_COST_PER_SESSION", unit: "USD", availability: "AVAILABLE", current: 1.5, prior: 1.2, deltaDirection: "UP" },
      { key: "NOTIFICATION_DELIVERY", unit: "PERCENT", availability: "AVAILABLE", current: 95, prior: 95, deltaDirection: "FLAT" },
    ],
    clubBenchmark: { availability: "NOT_ENOUGH_DATA", rows: [] },
    series: [],
  };
}

async function routeAnalytics(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/analytics/overview**", async (route) => {
    const url = new URL(route.request().url());
    const windowParam = (url.searchParams.get("window") ?? "30d") as "7d" | "30d" | "90d";
    await json(route, 200, overview(windowParam));
  });
}

test("owner reviews admin analytics overview and switches window", async ({ page }) => {
  await routePlatformAdminShell(page, "OWNER");
  await routeAnalytics(page);

  await page.goto("/admin/analytics");

  await expect(page.getByRole("heading", { name: "분석" })).toBeVisible();
  await expect(page.getByText("80%")).toBeVisible();
  await expect(page.getByText("클럽 비교에 충분한 데이터가 없습니다.")).toBeVisible();

  await page.getByRole("button", { name: "최근 7일" }).click();

  await expect(page).toHaveURL(/window=7d/);
  await expect(page.getByText("70%")).toBeVisible();

  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
});
