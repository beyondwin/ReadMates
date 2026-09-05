import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { PlatformHealthSnapshotResponse } from "@/features/platform-admin/api/platform-admin-health-contracts";
import { routeEmptyAdminOperations } from "./admin-operations-e2e-fixtures";
import { expectMinimumTargetSize, expectNoHorizontalOverflow } from "./support/visual-authority-contract";

const OWNER_CAPABILITIES = [
  "VIEW_TODAY",
  "VIEW_CLUBS",
  "VIEW_CLUB_OPERATIONS",
  "VIEW_SERVICE_HEALTH",
  "VIEW_NOTIFICATION_OPERATIONS",
  "REPLAY_NOTIFICATIONS",
  "VIEW_AI_OPERATIONS",
  "MANAGE_AI_OPERATIONS",
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
  await routeEmptyAdminOperations(page);
  await page.route("**/api/bff/api/admin/capabilities**", async (route) => {
    await json(route, 200, {
      schemaVersion: 1,
      role,
      status: "ACTIVE",
      capabilities: [...OWNER_CAPABILITIES],
      generatedAt: "2026-08-22T00:00:00Z",
    });
  });
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
  lastSuccessfulAt: "2026-05-26T00:00:00Z",
  refreshState: "FRESH",
  staleAgeSeconds: 0,
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
  await page.unroute("**/api/bff/api/admin/health/snapshot**");
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

  await expect(page.getByRole("heading", { name: "서비스 건강" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "서비스 상태" })).toBeVisible();
  await expect(page.getByRole("region", { name: "서비스 신호" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectMinimumTargetSize(page.getByRole("button", { name: "새로 확인" }).first());
  await expect(page.locator(".admin-case-docket")).toHaveCount(0);
  await expect(page.locator(".admin-action-dock")).toHaveCount(0);
  await expect(page.locator(".admin-receipt-timeline")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "AI 작업 대기열" })).toBeVisible();
  await page.getByRole("button", { name: "도메인 상세 펼치기" }).click();
  await expect(page.getByRole("heading", { name: "Redis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "알림 대기열" })).toHaveCount(0);
  await expect(page.getByText("정상 범위 서비스").first()).toBeVisible();
  await expect(page.getByText("기술 정보 펼치기")).toBeVisible();
  await expect(page.getByText("readmates-api:dev-20260526")).not.toBeVisible();
  await expect(
    page.locator("article", { hasText: "Redis" }).getByText("redis_metrics_unavailable"),
  ).not.toBeVisible();
  await page.getByText("정상 범위 서비스").first().click();
  await expect(page.getByRole("link", { name: "알림 대기열" })).toBeVisible();
  await expect(page.getByRole("link", { name: "알림 대기열" })).toHaveAttribute(
    "href",
    "/admin/notifications?focus=outbox_backlog",
  );
  await page.getByRole("link", { name: "알림 대기열" }).click();
  await expect(page).toHaveURL(/\/admin\/notifications\?focus=outbox_backlog/);
  await expect(page.getByText(/서비스 상태의 발송 대기 신호/)).toBeVisible();
  await page.goto("/admin/health");
  await expect(page.getByRole("button", { name: "새로 확인" }).first()).toBeVisible();
  await page.getByRole("button", { name: "새로 확인" }).first().click();
  await page.getByText("정상 범위 서비스").first().click();
  await expect(page.getByRole("link", { name: "AI 제공자" })).toHaveAttribute(
    "href",
    "/admin/ai-ops",
  );
  await expect(page.getByText(/NaN/)).toHaveCount(0);
});

const HEALTH_REFRESH_FIXTURES = [
  {
    name: "stale with server age",
    snapshot: { ...HEALTH_SNAPSHOT, refreshState: "STALE" as const, staleAgeSeconds: 125 },
    expected: "마지막 확인 자료가 2분 5초 전입니다.",
  },
  {
    name: "refreshing with last known good cards",
    snapshot: { ...HEALTH_SNAPSHOT, refreshState: "REFRESHING" as const, staleAgeSeconds: 12 },
    expected: "새 상태를 확인하고 있습니다.",
  },
  {
    name: "unavailable before first success",
    snapshot: {
      ...HEALTH_SNAPSHOT,
      lastSuccessfulAt: null,
      refreshState: "UNAVAILABLE" as const,
      staleAgeSeconds: 0,
    },
    expected: "최근 상태 자료를 확인할 수 없습니다.",
  },
] as const;

for (const fixture of HEALTH_REFRESH_FIXTURES) {
  test(`operator sees ${fixture.name} metadata without losing cards`, async ({ page }) => {
    await routePlatformAdminShell(page, "OWNER");
    await page.unroute("**/api/bff/api/admin/health/snapshot**");
    await page.route("**/api/bff/api/admin/health/snapshot", async (route) => {
      await json(route, 200, fixture.snapshot);
    });

    await page.goto("/admin/health");

    await expect(page.getByText(fixture.expected, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI 작업 대기열" })).toBeVisible();
    await expect(page.getByText("기술 정보 펼치기")).toBeVisible();
  });
}
