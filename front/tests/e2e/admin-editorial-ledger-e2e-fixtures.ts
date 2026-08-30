import type { Page, Route } from "@playwright/test";
import type { AdminOperationAction } from "@/features/platform-admin/api/platform-admin-operations-contracts";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { PlatformAdminCapability } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { routeEmptyAdminOperations } from "./admin-operations-e2e-fixtures";

const GENERATED_AT = "2026-08-26T10:00:00Z";

export const TODAY_VIEW_CAPABILITIES = ["VIEW_TODAY"] as const satisfies readonly PlatformAdminCapability[];
export const CLUBS_LEDGER_CAPABILITIES = [
  "VIEW_CLUBS",
  "VIEW_CLUB_OPERATIONS",
  "CREATE_CLUB",
] as const satisfies readonly PlatformAdminCapability[];
export const HEALTH_READ_CAPABILITIES = [
  "VIEW_SERVICE_HEALTH",
] as const satisfies readonly PlatformAdminCapability[];
export const AUDIT_REVIEW_CAPABILITIES = ["VIEW_AUDIT"] as const satisfies readonly PlatformAdminCapability[];
export const NOTIFICATION_VIEW_ONLY_CAPABILITIES = [
  "VIEW_NOTIFICATION_OPERATIONS",
] as const satisfies readonly PlatformAdminCapability[];
export const NOTIFICATION_REPLAY_CAPABILITIES = [
  "VIEW_NOTIFICATION_OPERATIONS",
  "REPLAY_NOTIFICATIONS",
] as const satisfies readonly PlatformAdminCapability[];

export const TODAY_ACKNOWLEDGE_ONLY = ["ACKNOWLEDGE"] as const satisfies readonly AdminOperationAction[];

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function platformAdminAuth(role: PlatformAdminRole): AuthMeResponse {
  const account = role.toLowerCase();
  return {
    authenticated: true,
    userId: `platform-${account}`,
    membershipId: null,
    clubId: null,
    email: `${account}@example.test`,
    displayName: `${role} admin`,
    accountName: `${role} admin`,
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: {
      userId: `platform-${account}`,
      email: `${account}@example.test`,
      role,
    },
    availableSpaces: {
      version: 1,
      kinds: ["PLATFORM"],
      clubs: [],
    },
    recommendedAppEntryUrl: "/admin",
  };
}

export async function routeAdminEditorialLedgerShell(
  page: Page,
  options: {
    capabilities: readonly PlatformAdminCapability[];
    authRole?: PlatformAdminRole;
  },
): Promise<void> {
  const authRole = options.authRole ?? "OWNER";
  await routeEmptyAdminOperations(page);
  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, platformAdminAuth(authRole)));
  await page.route("**/api/bff/api/admin/capabilities**", (route) => json(route, 200, {
    schemaVersion: 1,
    role: authRole,
    status: "ACTIVE",
    capabilities: [...options.capabilities],
    generatedAt: "2026-08-26T00:00:00Z",
  }));
  await page.route("**/api/bff/api/admin/summary", (route) => json(route, 200, {
    platformRole: authRole,
    activeClubCount: 1,
    domainActionRequiredCount: 0,
    domains: [],
    domainsRequiringAction: [],
  }));
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).pathname !== "/api/bff/api/admin/clubs") {
      await route.fallback();
      return;
    }
    await json(route, 200, { items: [] });
  });
}

export async function routeAdminTodayCases(
  page: Page,
  options: {
    allowedActions: readonly AdminOperationAction[];
  },
): Promise<void> {
  const source = {
    sourceType: "NOTIFICATION",
    status: "AVAILABLE",
    generatedAt: GENERATED_AT,
    lastSuccessfulAt: GENERATED_AT,
    authoritative: true,
  } as const;
  const item = {
    id: "case-notification",
    sourceType: "NOTIFICATION",
    clubId: null,
    state: "OPEN",
    severity: "CRITICAL",
    summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
    firstObservedAt: "2026-08-26T08:00:00Z",
    lastObservedAt: GENERATED_AT,
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: true,
    reopenCount: 0,
    version: 3,
    impactCount: 2,
    detailHref: "/admin/notifications",
    allowedActions: [...options.allowedActions],
    source,
  };

  await page.route("**/api/bff/api/admin/operations/cases**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/cases/case-notification")) {
      return json(route, 200, {
        schema: "admin.operation_cases.v1",
        item,
        history: [{
          fromState: null,
          toState: "OPEN",
          action: null,
          reasonCode: "SIGNAL_OPENED",
          occurredAt: "2026-08-26T08:00:00Z",
          caseVersion: 1,
        }],
      });
    }
    return json(route, 200, {
      schema: "admin.operation_cases.v1",
      generatedAt: GENERATED_AT,
      counts: { open: 1, critical: 1, assignedToMe: 1, snoozed: 0 },
      sources: [source],
      items: [item],
      nextCursor: null,
    });
  });
}

export async function routeAdminClubsLedger(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/clubs**", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() !== "GET" || requestUrl.pathname !== "/api/bff/api/admin/clubs") {
      await route.fallback();
      return;
    }
    await json(route, 200, {
      items: [
        {
          clubId: "club-1",
          slug: "broken",
          name: "Broken Club",
          tagline: "",
          about: "",
          status: "ACTIVE",
          publicVisibility: "PRIVATE",
          domainCount: 1,
          domainActionRequiredCount: 2,
          notificationFailureCount: 2,
          aiFailureCount: 0,
          firstHostOnboardingState: "ASSIGNED",
          adminRevision: 7,
        },
        {
          clubId: "club-2",
          slug: "healthy",
          name: "Healthy Club",
          tagline: "",
          about: "",
          status: "ACTIVE",
          publicVisibility: "PUBLIC",
          domainCount: 1,
          domainActionRequiredCount: 0,
          notificationFailureCount: 0,
          aiFailureCount: 0,
          firstHostOnboardingState: "ASSIGNED",
          adminRevision: 4,
        },
      ],
      nextCursor: null,
    });
  });
  await page.route("**/api/bff/api/admin/clubs/club-1", (route) => json(route, 200, {
    clubId: "club-1",
    slug: "broken",
    name: "Broken Club",
    tagline: "",
    about: "",
    status: "ACTIVE",
    publicVisibility: "PRIVATE",
    domainCount: 1,
    domainActionRequiredCount: 2,
    notificationFailureCount: 2,
    aiFailureCount: 0,
    firstHostOnboardingState: "ASSIGNED",
    adminRevision: 7,
    domains: [],
  }));
  await page.route("**/api/bff/api/admin/clubs/club-1/operations", (route) => json(route, 200, {
    schema: "admin.club_operations_snapshot.v1",
    generatedAt: GENERATED_AT,
    club: {
      clubId: "club-1",
      slug: "broken",
      name: "Broken Club",
      status: "ACTIVE",
      publicVisibility: "PRIVATE",
    },
    readiness: { state: "READY", blockingReasons: [], nextAction: null },
    memberActivity: { activeCount: 0, dormantCount: 0, pendingViewerCount: 0, hostCount: 1 },
    sessionProgress: {
      upcomingCount: 0,
      currentOpenCount: 0,
      closedCount: 0,
      publishedRecordCount: 0,
      incompleteRecordCount: 0,
    },
    notificationHealth: { pending: 0, failed: 2, dead: 0, lastSuccessAt: null, failureClusters: [] },
    aiUsage: {
      activeJobs: 0,
      failedRecentJobs: 0,
      staleCandidates: 0,
      costEstimateUsd: "0.0000",
      state: "NO_ACTIVITY",
    },
    safeLinks: [],
  }));
}

export async function routeAdminHealthSnapshot(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/health/snapshot", (route) => json(route, 200, {
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
        drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications" },
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
        ],
      },
    ],
  }));
}

export async function routeAdminAuditLedger(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/audit/events**", (route) => json(route, 200, {
    generatedAt: "2026-05-27T00:00:00Z",
    filters: { range: "7d" },
    summary: { visibleCount: 2, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
    nextCursor: null,
    items: [
      {
        id: "platform_audit_events:event-1",
        occurredAt: "2026-05-27T00:01:00Z",
        sourceSlice: "S5",
        sourceTable: "platform_audit_events",
        actionCategory: "NOTIFICATION",
        actionType: "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
        outcome: "SUCCESS",
        actor: { userId: "platform-owner-user", role: "OWNER", displayLabel: "OWNER" },
        target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
        summary: "알림 재처리가 확정되었습니다.",
        safeMetadata: [{ label: "selectionHashPrefix", value: "aaaaaaaa", kind: "fingerprint" }],
        metadataState: "AVAILABLE",
      },
      {
        id: "platform_audit_events:event-2",
        occurredAt: "2026-05-27T00:00:00Z",
        sourceSlice: "S4",
        sourceTable: "platform_audit_events",
        actionCategory: "SUPPORT",
        actionType: "SUPPORT_ACCESS_GRANT_CREATED",
        outcome: "FAILED",
        actor: { userId: "platform-owner-user", role: "OWNER", displayLabel: "OWNER" },
        target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "사용자 숨김" },
        summary: "support grant가 생성되었습니다.",
        safeMetadata: [{ label: "scope", value: "METADATA_READ", kind: "code" }],
        metadataState: "AVAILABLE",
      },
    ],
  }));
}

export async function routeAdminNotificationsLedger(page: Page): Promise<{ previewCount: number }> {
  const counts = { previewCount: 0 };
  await page.route("**/api/bff/api/admin/notifications/snapshot", (route) => json(route, 200, {
    generatedAt: "2026-05-27T00:00:00Z",
    outboxSummary: { pending: 3, active: 0, failed: 1, dead: 1, sentOrPublishedLast24h: 7 },
    deliverySummary: { pending: 1, active: 0, failed: 1, dead: 1, sentOrPublishedLast24h: 6 },
    relaySummary: { publishing: 0, sending: 0, stalePublishing: 1, staleSending: 0 },
    failureClusters: [{ safeErrorCode: "mailbox_unavailable", status: "DEAD", count: 2, latestAt: "2026-05-27T00:00:00Z" }],
    clubHealth: [],
    recentManualDispatches: [],
  }));
  await page.route("**/api/bff/api/admin/notifications/events**", (route) => json(route, 200, {
    items: [{
      eventId: "event-1",
      club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
      eventType: "SESSION_REMINDER_DUE",
      source: "AUTOMATIC",
      status: "FAILED",
      attemptCount: 2,
      nextAttemptAt: null,
      createdAt: "2026-05-27T00:00:00Z",
      updatedAt: "2026-05-27T00:01:00Z",
      safeErrorCode: "mailbox_unavailable",
      manualDispatch: null,
    }],
    nextCursor: null,
  }));
  await page.route("**/api/bff/api/admin/notifications/deliveries**", (route) => json(route, 200, {
    items: [{
      deliveryId: "delivery-1",
      eventId: "event-1",
      club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
      channel: "EMAIL",
      status: "DEAD",
      maskedRecipient: "m***@example.com",
      attemptCount: 2,
      createdAt: "2026-05-27T00:00:00Z",
      updatedAt: "2026-05-27T00:01:00Z",
      safeErrorCode: "mailbox_unavailable",
    }],
    nextCursor: null,
  }));
  await page.route("**/api/bff/api/admin/notifications/replay-preview", async (route) => {
    counts.previewCount += 1;
    await json(route, 200, {
      previewId: "preview-1",
      selectionHash: "a".repeat(64),
      matchedCount: 2,
      excludedCount: 0,
      estimatedByStatus: { DEAD: 2 },
      warnings: [],
      expiresAt: "2026-05-27T00:10:00Z",
    });
  });
  return counts;
}
