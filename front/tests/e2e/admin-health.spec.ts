import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { PlatformHealthSnapshotResponse } from "@/features/platform-admin/api/platform-admin-health-contracts";

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
    platformAdmin: {
      userId: `platform-${role.toLowerCase()}-user`,
      email,
      role,
    },
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

const HEALTH_SNAPSHOT: PlatformHealthSnapshotResponse = {
  schema: "platform.health_snapshot.v1",
  generated_at: "2026-05-26T00:00:00Z",
  cards: [
    {
      id: "outbox_backlog",
      title: "Outbox backlog",
      status: "OK",
      metric: { value: 42, unit: "rows", label: "pending" },
      thresholds: { warn: 100, crit: 1000 },
      last_checked_at: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: { kind: "admin_route", target: "/admin/notifications" },
      reason: null,
      deploy_strip: null,
    },
    {
      id: "kafka_consumer_lag",
      title: "Kafka consumer lag",
      status: "WARN",
      metric: { value: 75, unit: "records", label: "max across partitions" },
      thresholds: { warn: 50, crit: 500 },
      last_checked_at: "2026-05-26T00:00:00Z",
      source: "PROMETHEUS",
      drill: null,
      reason: null,
      deploy_strip: null,
    },
    {
      id: "redis",
      title: "Redis",
      status: "UNKNOWN",
      metric: null,
      thresholds: { warn: 1, crit: 50 },
      last_checked_at: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: null,
      reason: "redis_metrics_unavailable",
      deploy_strip: null,
    },
  ],
};

test("operator views /admin/health grid", async ({ page }) => {
  await routePlatformAdminShell(page, "OWNER");
  await page.route("**/api/bff/api/admin/health/snapshot", async (route) => {
    await json(route, 200, HEALTH_SNAPSHOT);
  });

  await page.goto("/admin/health");

  await expect(page.getByRole("heading", { name: "Platform Health" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outbox backlog" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kafka consumer lag" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Redis" })).toBeVisible();
  await expect(page.getByText("redis_metrics_unavailable")).toBeVisible();
  await expect(
    page.locator("article", { hasText: "Outbox backlog" }).getByRole("link", { name: /자세히/ }),
  ).toHaveAttribute("href", "/admin/notifications");
});
