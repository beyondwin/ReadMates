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
  generatedAt: "2026-05-26T00:00:00Z",
  cards: [
    {
      id: "outbox_backlog",
      title: "Outbox backlog",
      status: "OK",
      metric: { value: 42, unit: "rows", label: "pending" },
      thresholds: { warn: 100, crit: 1000 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications?focus=outbox_backlog" },
      reason: null,
      deployStrip: null,
    },
    {
      id: "kafka_consumer_lag",
      title: "Kafka consumer lag",
      status: "WARN",
      metric: { value: 75, unit: "records", label: "max across partitions" },
      thresholds: { warn: 50, crit: 500 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "PROMETHEUS",
      drill: null,
      reason: null,
      deployStrip: null,
    },
    {
      id: "redis",
      title: "Redis",
      status: "UNKNOWN",
      metric: null,
      thresholds: { warn: 1, crit: 50 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: null,
      reason: "redis_metrics_unavailable",
      deployStrip: null,
    },
    {
      id: "db_pool",
      title: "DB pool",
      status: "OK",
      metric: { value: 3, unit: "connections", label: "active" },
      thresholds: { warn: 8, crit: 12 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: null,
      reason: null,
      deployStrip: null,
    },
    {
      id: "notification_dispatch_success",
      title: "Notification dispatch success",
      status: "OK",
      metric: { value: 0.997, unit: "ratio", label: "last 5m" },
      thresholds: { warn: 0.95, crit: 0.9 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "PROMETHEUS",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications?focus=notification_dispatch_success" },
      reason: null,
      deployStrip: null,
    },
    {
      id: "ai_provider_availability",
      title: "AI provider availability",
      status: "OK",
      metric: { value: 1, unit: "ratio", label: "last 5m" },
      thresholds: { warn: 0.98, crit: 0.9 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "PROMETHEUS",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/ai-ops" },
      reason: null,
      deployStrip: null,
    },
    {
      id: "deploy_attempts_strip",
      title: "Deploy attempts",
      status: "OK",
      metric: null,
      thresholds: null,
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "FILE",
      drill: null,
      reason: null,
      deployStrip: [
        {
          attemptId: "deploy-dev-001",
          startedAt: "2026-05-26T00:00:00Z",
          endedAt: "2026-05-26T00:02:00Z",
          finalStatus: "SUCCEEDED",
          imageTag: "readmates-api:dev-20260526",
          durationSeconds: 120,
        },
        {
          attemptId: "deploy-dev-000",
          startedAt: "2026-05-25T23:00:00Z",
          endedAt: "2026-05-25T23:01:30Z",
          finalStatus: "FAILED",
          imageTag: "readmates-api:previous",
          durationSeconds: 90,
        },
      ],
    },
  ],
};

test("operator views /admin/health grid", async ({ page }) => {
  await routePlatformAdminShell(page, "OWNER");
  await page.route("**/api/bff/api/admin/health/snapshot", async (route) => {
    await json(route, 200, HEALTH_SNAPSHOT);
  });
  await page.route("**/api/bff/api/admin/notifications/snapshot", async (route) => {
    await json(route, 200, {
      generatedAt: "2026-05-26T00:00:00Z",
      outboxSummary: { pending: 42, active: 0, failed: 1, dead: 0, sentOrPublishedLast24h: 3 },
      deliverySummary: { pending: 0, active: 0, failed: 1, dead: 0, sentOrPublishedLast24h: 3 },
      relaySummary: { publishing: 0, sending: 0, stalePublishing: 0, staleSending: 0 },
      failureClusters: [{ safeErrorCode: "provider_timeout", status: "FAILED", count: 1, latestAt: "2026-05-26T00:00:00Z" }],
      clubHealth: [],
      recentManualDispatches: [],
    });
  });
  await page.route("**/api/bff/api/admin/notifications/events**", async (route) => {
    await json(route, 200, { items: [], nextCursor: null });
  });
  await page.route("**/api/bff/api/admin/notifications/deliveries**", async (route) => {
    await json(route, 200, { items: [], nextCursor: null });
  });

  await page.goto("/admin/health");

  await expect(page.getByRole("heading", { name: "Platform Health" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outbox backlog" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kafka consumer lag" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Redis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DB pool" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notification dispatch success" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI provider availability" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "최근 deploy" })).toBeVisible();
  await expect(page.getByText("readmates-api:dev-20260526")).toBeVisible();
  await expect(page.getByText("redis_metrics_unavailable")).toBeVisible();
  await expect(
    page.locator("article", { hasText: "Outbox backlog" }).getByRole("link", { name: /자세히/ }),
  ).toHaveAttribute("href", "/admin/notifications?focus=outbox_backlog");
  await page.locator("article", { hasText: "Outbox backlog" }).getByRole("link", { name: /자세히/ }).click();
  await expect(page).toHaveURL(/\/admin\/notifications\?focus=outbox_backlog/);
  await expect(page.getByText(/Health outbox backlog/)).toBeVisible();
  await page.goto("/admin/health");
  await expect(page.getByRole("button", { name: "새로고침" })).toBeVisible();
  await page.getByRole("button", { name: "새로고침" }).click();
  await expect(
    page.locator("article", { hasText: "AI provider availability" }).getByRole("link", { name: /자세히/ }),
  ).toHaveAttribute("href", "/admin/ai-ops");
  await expect(page.getByText(/NaN/)).toHaveCount(0);
});
