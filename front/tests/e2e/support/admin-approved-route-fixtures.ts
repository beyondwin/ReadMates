import type { Page, Route } from "@playwright/test";
import type { AdminOperationAction, AdminOperationCase } from "@/features/platform-admin/api/platform-admin-operations-contracts";
import type { AdminOperationCasePresentation } from "@/features/platform-admin/model/platform-admin-operations-model";
import type { PlatformAdminCapability } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import {
  routeAdminAuditLedger,
  routeAdminClubsLedger,
  routeAdminEditorialLedgerShell,
  routeAdminHealthSnapshot,
  routeAdminTodayCases,
} from "../admin-editorial-ledger-e2e-fixtures";
import type { ApprovedRouteFixtureKey } from "./approved-route-scenarios";
import type { ApprovedRouteRequestAudit } from "./approved-route-request-audit";

const GENERATED_AT = "2026-08-26T10:00:00Z";
const ADMIN_TODAY_CAPABILITIES = [
  "VIEW_TODAY",
  "VIEW_CLUBS",
  "VIEW_SERVICE_HEALTH",
  "VIEW_AUDIT",
] as const satisfies readonly PlatformAdminCapability[];
const ADMIN_CLUBS_CAPABILITIES = [
  ...ADMIN_TODAY_CAPABILITIES,
  "VIEW_CLUB_OPERATIONS",
  "CREATE_CLUB",
] as const satisfies readonly PlatformAdminCapability[];
const TODAY_LIFECYCLE_ACTIONS = [
  "ACKNOWLEDGE",
  "SNOOZE",
  "RESOLVE",
] as const satisfies readonly AdminOperationAction[];

const ADMIN_TODAY_FIXTURE_PATHS = [
  "/api/bff/api/auth/me",
  "/api/bff/api/admin/capabilities",
  "/api/bff/api/admin/summary",
  "/api/bff/api/admin/clubs",
  "/api/bff/api/admin/health/snapshot",
  "/api/bff/api/admin/operations/cases",
] as const;
const FRONTEND_OBSERVABILITY_PATH = "/api/bff/observability/frontend-events";

export const ADMIN_APPROVED_SAMPLE_CLUB = {
  clubId: "club-sample-reading",
  clubSlug: "sample-reading",
  clubName: "샘플 독서모임",
} as const;

export const ADMIN_APPROVED_SAMPLE_CLUB_PERSPECTIVES = ["MEMBER", "HOST"] as const;

const ADMIN_APPROVED_FIXTURE_KEYS = new Set<ApprovedRouteFixtureKey>([
  "admin-today",
  "admin-clubs",
  "admin-health",
  "admin-audit",
]);
const ADMIN_SHARED_FIXTURE_PATHS = [
  ...ADMIN_TODAY_FIXTURE_PATHS,
  "/api/bff/api/admin/audit/events",
] as const;

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function minutesBeforeGenerated(minutes: number): string {
  return new Date(Date.parse(GENERATED_AT) - minutes * 60_000).toISOString();
}

function availableSource(sourceType: AdminOperationCase["sourceType"]) {
  return {
    sourceType,
    status: "AVAILABLE" as const,
    generatedAt: GENERATED_AT,
    lastSuccessfulAt: GENERATED_AT,
    authoritative: true,
  };
}

function operationCase(
  overrides: Pick<AdminOperationCase, "id" | "sourceType" | "summaryCode" | "severity" | "firstObservedAt"> &
    Partial<AdminOperationCase> &
    AdminOperationCasePresentation,
): AdminOperationCase & AdminOperationCasePresentation {
  const source = availableSource(overrides.sourceType);
  return {
    clubId: null,
    state: "OPEN",
    lastObservedAt: GENERATED_AT,
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: true,
    reopenCount: 0,
    version: 3,
    impactCount: 2,
    detailHref: "/admin/notifications",
    allowedActions: [...TODAY_LIFECYCLE_ACTIONS],
    source,
    ...overrides,
  };
}

export type AdminApprovedCopyVariant = "default" | "long-korean" | "long-english" | "unbroken-token";
export type AdminApprovedListState = "ready" | "unavailable" | "stale" | "forbidden";

export type AdminApprovedRouteStressOptions = {
  caseCount?: number;
  copy?: AdminApprovedCopyVariant;
  listState?: AdminApprovedListState;
};

const ADMIN_STRESS_COPY: Record<Exclude<AdminApprovedCopyVariant, "default">, string> = {
  "long-korean": "알림 전달이 지연되어 운영자가 영향 범위와 최근 정상 전달 시각을 다시 확인해야 하는 공개 기록 확인 상태입니다",
  "long-english": "Notification delivery is delayed and the operator must reconfirm the latest authoritative observation before continuing.",
  "unbroken-token": "A".repeat(160),
};

export function buildAdminTodayOperationCases(options?: {
  count?: number;
  copy?: AdminApprovedCopyVariant;
  authoritative?: boolean;
}): AdminOperationCase[] {
  const items = [
    operationCase({
      id: "case-notification",
      sourceType: "NOTIFICATION",
      summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
      severity: "CRITICAL",
      firstObservedAt: minutesBeforeGenerated(10),
      summaryTitle: "알림 전달 지연",
      summaryDescription: "일부 안내가 늦게 전달되고 있습니다.",
      scopeLabel: "클럽 2곳 · 멤버 6명",
      impactLabel: "클럽 2곳 · 멤버 6명",
      evidenceLines: ["데이터 손실 없음", "마지막 정상 전달 13:52"],
      recommendation: "중복 발송을 확인한 뒤 실패한 안내만 다시 보냅니다.",
    }),
    operationCase({
      id: "case-closing-risk",
      sourceType: "CLOSING_RISK",
      summaryCode: "SESSION_CLOSING_BLOCKED",
      severity: "CRITICAL",
      firstObservedAt: minutesBeforeGenerated(35),
      detailHref: "/admin/clubs",
      summaryTitle: "공개 기록 확인",
      summaryDescription: "새로 생성된 공개 기록을 확인하세요.",
      scopeLabel: "처리 필요: 새로 생성된 공개 기록 1건",
      impactLabel: "기록 1건",
    }),
    operationCase({
      id: "case-ai-job",
      sourceType: "AI_JOB",
      summaryCode: "AI_JOB_FAILED",
      severity: "CRITICAL",
      firstObservedAt: minutesBeforeGenerated(60),
      detailHref: "/admin/health",
      summaryTitle: "요약 결과 확인",
      summaryDescription: "요약 결과를 확인하세요.",
      scopeLabel: "처리 필요: 요약 결과 3건",
      impactLabel: "결과 3건",
    }),
    operationCase({
      id: "case-notify-backlog",
      sourceType: "NOTIFICATION",
      summaryCode: "NOTIFICATION_PLATFORM_BACKLOG",
      severity: "WARNING",
      firstObservedAt: "2026-08-26T07:00:00Z",
    }),
    operationCase({
      id: "case-club-setup",
      sourceType: "CLUB_READINESS",
      summaryCode: "CLUB_SETUP_REQUIRED",
      severity: "WARNING",
      firstObservedAt: "2026-08-26T07:10:00Z",
      detailHref: "/admin/clubs",
    }),
    operationCase({
      id: "case-club-domain",
      sourceType: "CLUB_READINESS",
      summaryCode: "CLUB_DOMAIN_ACTION_REQUIRED",
      severity: "WARNING",
      firstObservedAt: "2026-08-26T07:20:00Z",
      detailHref: "/admin/clubs",
    }),
    operationCase({
      id: "case-ai-stale",
      sourceType: "AI_JOB",
      summaryCode: "AI_JOB_STALE",
      severity: "WARNING",
      firstObservedAt: "2026-08-26T07:30:00Z",
      detailHref: "/admin/health",
    }),
    operationCase({
      id: "case-club-ready",
      sourceType: "CLUB_READINESS",
      summaryCode: "CLUB_READY_TO_PUBLISH",
      severity: "READY",
      firstObservedAt: "2026-08-26T08:00:00Z",
      detailHref: "/admin/clubs",
    }),
    operationCase({
      id: "case-closing-followup",
      sourceType: "CLOSING_RISK",
      summaryCode: "SESSION_CLOSING_BLOCKED",
      severity: "READY",
      firstObservedAt: "2026-08-26T08:10:00Z",
      detailHref: "/admin/clubs",
    }),
    operationCase({
      id: "case-info-ready",
      sourceType: "CLUB_READINESS",
      summaryCode: "CLUB_READY_TO_PUBLISH",
      severity: "INFO",
      firstObservedAt: "2026-08-26T09:00:00Z",
      detailHref: "/admin/clubs",
    }),
  ];
  const count = options?.count ?? items.length;
  const sliced = items.slice(0, count);
  const copy = options?.copy ?? "default";
  const titled = copy === "default" || sliced[0] == null
    ? sliced
    : [{ ...sliced[0], summaryTitle: ADMIN_STRESS_COPY[copy] }, ...sliced.slice(1)];
  if (options?.authoritative === false) {
    return titled.map((item) => ({
      ...item,
      source: { ...item.source, authoritative: false },
    }));
  }
  return titled;
}

const APPROVED_CLUB_SAMPLE = {
  clubId: "club-sample",
  slug: "sample-reading",
  name: "샘플 독서모임",
  tagline: "",
  about: "",
  status: "ACTIVE" as const,
  publicVisibility: "PUBLIC" as const,
  domainCount: 1,
  domainActionRequiredCount: 0,
  notificationFailureCount: 0,
  aiFailureCount: 0,
  firstHostOnboardingState: "ASSIGNED" as const,
  adminRevision: 4,
};

export function buildAdminApprovedClubs() {
  const items = Array.from({ length: 24 }, (_, index) => {
    const n = index + 1;
    if (n === 1) return { ...APPROVED_CLUB_SAMPLE };
    return {
      ...APPROVED_CLUB_SAMPLE,
      clubId: `club-sample-${n}`,
      slug: `sample-reading-${n}`,
      name: `샘플 독서모임 ${n}`,
      publicVisibility: "PRIVATE" as const,
      domainActionRequiredCount: n === 2 || n === 3 ? 1 : 0,
      adminRevision: n,
    };
  });
  return {
    items,
    nextCursor: "clubs-visual-next",
  };
}

export function buildAdminApprovedAuditEvents() {
  return {
    generatedAt: GENERATED_AT,
    filters: {
      range: "7d",
      from: "2026-08-19T10:00:00.000Z",
      to: GENERATED_AT,
    },
    summary: {
      visibleCount: 3,
      sourceUnavailableCount: 0,
      metadataUnavailableCount: 0,
      unavailableSources: [] as string[],
    },
    nextCursor: "audit-visual-next",
    items: [
      {
        id: "audit-visual-1",
        occurredAt: "2026-08-26T05:52:00Z",
        sourceSlice: "S5" as const,
        sourceTable: "platform_audit_events",
        actionCategory: "NOTIFICATION" as const,
        actionType: "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
        outcome: "SUCCESS" as const,
        actor: { userId: "platform-operator", role: "OPERATOR" as const, displayLabel: "OPERATOR" },
        target: {
          clubId: "club-sample",
          userId: null,
          jobId: null,
          eventId: "preview-sample",
          label: "알림 다시 보내기",
        },
        summary: "실패한 안내 6건을 다시 보냈습니다.",
        safeMetadata: [
          { label: "처리한 이유", value: "오늘 저녁 모임 안내 복구", kind: "text" as const },
          { label: "영향 범위", value: "클럽 2곳 · 멤버 6명", kind: "text" as const },
          { label: "변경 전", value: "전달 대기 6건", kind: "text" as const },
          { label: "변경 후", value: "전달 완료 6건", kind: "text" as const },
          { label: "처리 결과", value: "정상 반영 확인", kind: "text" as const },
        ],
        metadataState: "AVAILABLE" as const,
      },
      {
        id: "audit-visual-public-record",
        occurredAt: "2026-08-26T04:52:00Z",
        sourceSlice: "S3" as const,
        sourceTable: "platform_audit_events",
        actionCategory: "CLUB_LIFECYCLE" as const,
        actionType: "FEEDBACK_DOCUMENT_PUBLISHED",
        outcome: "SUCCESS" as const,
        actor: { userId: "platform-operator", role: "OPERATOR" as const, displayLabel: "OPERATOR" },
        target: {
          clubId: "club-sample",
          userId: null,
          jobId: null,
          eventId: null,
          label: "공개 기록",
        },
        summary: "공개 기록 확인을 완료했습니다.",
        safeMetadata: [{ label: "처리 결과", value: "정상", kind: "text" as const }],
        metadataState: "AVAILABLE" as const,
      },
      {
        id: "audit-visual-club-status",
        occurredAt: "2026-08-26T02:18:00Z",
        sourceSlice: "S3" as const,
        sourceTable: "platform_audit_events",
        actionCategory: "CLUB_LIFECYCLE" as const,
        actionType: "ADMIN_CLUB_METADATA_UPDATED",
        outcome: "SUCCESS" as const,
        actor: { userId: "platform-operator", role: "OPERATOR" as const, displayLabel: "OPERATOR" },
        target: {
          clubId: "club-sample",
          userId: null,
          jobId: null,
          eventId: null,
          label: "대상 클럽",
        },
        summary: "클럽 운영 상태를 변경했습니다.",
        safeMetadata: [{ label: "처리 결과", value: "정상", kind: "text" as const }],
        metadataState: "AVAILABLE" as const,
      },
    ],
  };
}

async function routeAdminTodayHealthySnapshot(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/health/snapshot", (route) => json(route, 200, {
    schema: "platform.health_snapshot.v1",
    generatedAt: GENERATED_AT,
    lastSuccessfulAt: GENERATED_AT,
    refreshState: "FRESH",
    staleAgeSeconds: 0,
    cards: [
      {
        id: "db_pool",
        title: "DB pool",
        status: "OK",
        metric: { value: 3, unit: "connections", label: "active" },
        thresholds: { warn: 8, crit: 12 },
        lastCheckedAt: GENERATED_AT,
        source: "IN_PROCESS",
        drill: null,
        reason: null,
        deployStrip: null,
      },
    ],
  }));
}

async function routeAdminTodayPriorityCases(
  page: Page,
  options?: AdminApprovedRouteStressOptions,
): Promise<void> {
  const listState = options?.listState ?? "ready";
  const items = buildAdminTodayOperationCases({
    count: options?.caseCount,
    copy: options?.copy,
    authoritative: listState === "stale" ? false : undefined,
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  const sources = [
    availableSource("NOTIFICATION"),
    availableSource("CLOSING_RISK"),
    availableSource("AI_JOB"),
    availableSource("CLUB_READINESS"),
  ].map((source) => listState === "stale" ? { ...source, authoritative: false } : source);

  await page.route("**/api/bff/api/admin/operations/cases**", (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }
    const pathname = new URL(route.request().url()).pathname;
    const detailId = pathname.match(/\/operations\/cases\/([^/]+)$/)?.[1];
    if (detailId) {
      const item = byId.get(detailId);
      if (!item) return route.fallback();
      return json(route, 200, {
        schema: "admin.operation_cases.v1",
        item,
        history: [{
          fromState: null,
          toState: "OPEN",
          action: null,
          reasonCode: "SIGNAL_OPENED",
          occurredAt: item.firstObservedAt,
          caseVersion: 1,
        }],
      });
    }
    if (listState === "unavailable") {
      return json(route, 500, { code: "INTERNAL_ERROR", message: "operations unavailable", status: 500 });
    }
    if (listState === "forbidden") {
      return json(route, 403, { code: "PERMISSION_DENIED", message: "이 작업을 수행할 권한이 없습니다.", status: 403 });
    }
    return json(route, 200, {
      schema: "admin.operation_cases.v1",
      generatedAt: GENERATED_AT,
      counts: { open: items.length, critical: Math.min(3, items.length), assignedToMe: items.length, snoozed: 0 },
      sources,
      items,
      nextCursor: null,
    });
  });
}

export function buildAdminApprovedAuth(
  overrides: Partial<AuthMeResponse> = {},
  role: PlatformAdminRole = "OPERATOR",
): AuthMeResponse {
  const account = role.toLowerCase();
  const sampleMembership = {
    clubId: ADMIN_APPROVED_SAMPLE_CLUB.clubId,
    clubSlug: ADMIN_APPROVED_SAMPLE_CLUB.clubSlug,
    clubName: ADMIN_APPROVED_SAMPLE_CLUB.clubName,
    membershipId: "membership-sample-reading",
    role: "HOST" as const,
    status: "ACTIVE" as const,
    approvalState: "ACTIVE" as const,
    primaryHost: null,
  };
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
    joinedClubs: [sampleMembership],
    platformAdmin: {
      userId: `platform-${account}`,
      email: `${account}@example.test`,
      role,
    },
    availableSpaces: {
      version: 1,
      kinds: ["PLATFORM", "CLUBS"],
      clubs: [{
        clubId: ADMIN_APPROVED_SAMPLE_CLUB.clubId,
        clubSlug: ADMIN_APPROVED_SAMPLE_CLUB.clubSlug,
        clubName: ADMIN_APPROVED_SAMPLE_CLUB.clubName,
        perspectives: [...ADMIN_APPROVED_SAMPLE_CLUB_PERSPECTIVES],
      }],
    },
    recommendedAppEntryUrl: "/admin",
    ...overrides,
  };
}

export function buildMemberAuthWithoutPlatformAdmin(): AuthMeResponse {
  return {
    authenticated: true,
    userId: "member-sample-reading",
    membershipId: "membership-sample-reading",
    clubId: ADMIN_APPROVED_SAMPLE_CLUB.clubId,
    email: "member@example.test",
    displayName: "샘플 멤버",
    accountName: "샘플 멤버",
    role: "MEMBER",
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
    currentMembership: {
      membershipId: "membership-sample-reading",
      clubId: ADMIN_APPROVED_SAMPLE_CLUB.clubId,
      clubSlug: ADMIN_APPROVED_SAMPLE_CLUB.clubSlug,
      displayName: "샘플 멤버",
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
      avatarKey: "banana-green-book",
    },
    joinedClubs: [{
      clubId: ADMIN_APPROVED_SAMPLE_CLUB.clubId,
      clubSlug: ADMIN_APPROVED_SAMPLE_CLUB.clubSlug,
      clubName: ADMIN_APPROVED_SAMPLE_CLUB.clubName,
      membershipId: "membership-sample-reading",
      role: "MEMBER",
      status: "ACTIVE",
      approvalState: "ACTIVE",
      primaryHost: null,
    }],
    platformAdmin: null,
    availableSpaces: {
      version: 1,
      kinds: ["CLUBS"],
      clubs: [{
        clubId: ADMIN_APPROVED_SAMPLE_CLUB.clubId,
        clubSlug: ADMIN_APPROVED_SAMPLE_CLUB.clubSlug,
        clubName: ADMIN_APPROVED_SAMPLE_CLUB.clubName,
        perspectives: ["MEMBER"],
      }],
    },
    recommendedAppEntryUrl: `/clubs/${ADMIN_APPROVED_SAMPLE_CLUB.clubSlug}/app`,
  };
}

export async function installAdminApprovedRoutes(
  page: Page,
  fixtureKey: ApprovedRouteFixtureKey,
  requestAudit: ApprovedRouteRequestAudit,
  options?: AdminApprovedRouteStressOptions,
): Promise<void> {
  if (!ADMIN_APPROVED_FIXTURE_KEYS.has(fixtureKey)) {
    throw new Error(`Unsupported Admin fixture key: ${fixtureKey}`);
  }

  const capabilities = fixtureKey === "admin-clubs"
    ? ADMIN_CLUBS_CAPABILITIES
    : ADMIN_TODAY_CAPABILITIES;

  for (const path of ADMIN_SHARED_FIXTURE_PATHS) {
    requestAudit.allowFixture({ method: "GET", path });
  }
  requestAudit.allowFixture({ method: "POST", path: FRONTEND_OBSERVABILITY_PATH });
  for (const item of buildAdminTodayOperationCases({
    count: options?.caseCount,
    copy: options?.copy,
    authoritative: options?.listState === "stale" ? false : undefined,
  })) {
    requestAudit.allowFixture({
      method: "GET",
      path: `/api/bff/api/admin/operations/cases/${item.id}`,
    });
  }
  if (fixtureKey === "admin-clubs") {
    requestAudit.allowFixture({ method: "GET", path: "/api/bff/api/admin/clubs/club-sample" });
    requestAudit.allowFixture({
      method: "GET",
      path: "/api/bff/api/admin/clubs/club-sample/operations",
    });
  }

  await routeAdminEditorialLedgerShell(page, {
    capabilities,
    authRole: "OPERATOR",
  });
  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, buildAdminApprovedAuth()));
  await routeAdminHealthSnapshot(page);
  await routeAdminTodayHealthySnapshot(page);
  await routeAdminTodayCases(page, { allowedActions: TODAY_LIFECYCLE_ACTIONS });
  await routeAdminTodayPriorityCases(page, options);
  await page.route("**/api/bff/observability/frontend-events", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({ status: 204 });
  });

  if (fixtureKey === "admin-clubs") {
    await routeAdminClubsLedger(page);
    await routeAdminApprovedClubs(page);
    await routeAdminAuditLedger(page);
    await routeAdminApprovedAudit(page);
  }
  if (fixtureKey === "admin-health") {
    await routeAdminApprovedHealth(page);
  }
  if (fixtureKey === "admin-audit") {
    await routeAdminAuditLedger(page);
    await routeAdminApprovedAudit(page);
  }
}

async function routeAdminApprovedClubs(page: Page): Promise<void> {
  const firstPage = buildAdminApprovedClubs();
  const nextClub = {
    ...APPROVED_CLUB_SAMPLE,
    clubId: "club-sample-next",
    slug: "sample-reading-next",
    name: "샘플 독서모임 다음",
    adminRevision: 2,
  };
  await page.route("**/api/bff/api/admin/clubs**", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    if (requestUrl.pathname === "/api/bff/api/admin/clubs/club-sample") {
      await json(route, 200, { ...APPROVED_CLUB_SAMPLE, domains: [] });
      return;
    }
    if (requestUrl.pathname === "/api/bff/api/admin/clubs/club-sample/operations") {
      await json(route, 200, {
        schema: "admin.club_operations_snapshot.v1",
        generatedAt: GENERATED_AT,
        club: {
          clubId: APPROVED_CLUB_SAMPLE.clubId,
          slug: APPROVED_CLUB_SAMPLE.slug,
          name: APPROVED_CLUB_SAMPLE.name,
          status: APPROVED_CLUB_SAMPLE.status,
          publicVisibility: APPROVED_CLUB_SAMPLE.publicVisibility,
        },
        readiness: { state: "READY", blockingReasons: [], nextAction: null },
        memberActivity: { activeCount: 6, dormantCount: 0, pendingViewerCount: 0, hostCount: 1 },
        sessionProgress: {
          upcomingCount: 0,
          currentOpenCount: 0,
          closedCount: 0,
          publishedRecordCount: 1,
          incompleteRecordCount: 0,
        },
        notificationHealth: {
          pending: 0,
          failed: 0,
          dead: 0,
          lastSuccessAt: GENERATED_AT,
          failureClusters: [],
        },
        aiUsage: {
          activeJobs: 0,
          failedRecentJobs: 0,
          staleCandidates: 0,
          costEstimateUsd: "0.0000",
          state: "NO_ACTIVITY",
        },
        safeLinks: [],
      });
      return;
    }
    if (requestUrl.pathname !== "/api/bff/api/admin/clubs") {
      await route.fallback();
      return;
    }
    if (requestUrl.searchParams.get("cursor") === firstPage.nextCursor) {
      await json(route, 200, { items: [nextClub], nextCursor: null });
      return;
    }
    await json(route, 200, firstPage);
  });
}

async function routeAdminApprovedHealth(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/health/snapshot", (route) => json(route, 200, {
    schema: "platform.health_snapshot.v1",
    generatedAt: GENERATED_AT,
    lastSuccessfulAt: GENERATED_AT,
    refreshState: "FRESH",
    staleAgeSeconds: 0,
    cards: [
      {
        id: "outbox_backlog",
        title: "Outbox backlog",
        status: "WARN",
        metric: { value: 120, unit: "rows", label: "pending" },
        thresholds: { warn: 100, crit: 1000 },
        lastCheckedAt: GENERATED_AT,
        source: "IN_PROCESS",
        drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications?focus=outbox_backlog" },
        reason: null,
        deployStrip: null,
      },
      {
        id: "kafka_consumer_lag",
        title: "Kafka consumer lag",
        status: "OK",
        metric: { value: 12, unit: "records", label: "max across partitions" },
        thresholds: { warn: 50, crit: 500 },
        lastCheckedAt: GENERATED_AT,
        source: "PROMETHEUS",
        drill: null,
        reason: null,
        deployStrip: null,
      },
      {
        id: "redis",
        title: "Redis",
        status: "OK",
        metric: { value: 0, unit: "errors", label: "current" },
        thresholds: { warn: 1, crit: 50 },
        lastCheckedAt: GENERATED_AT,
        source: "IN_PROCESS",
        drill: null,
        reason: null,
        deployStrip: null,
      },
      {
        id: "db_pool",
        title: "DB pool",
        status: "OK",
        metric: { value: 3, unit: "connections", label: "active" },
        thresholds: { warn: 8, crit: 12 },
        lastCheckedAt: GENERATED_AT,
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
        lastCheckedAt: GENERATED_AT,
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
        lastCheckedAt: GENERATED_AT,
        source: "PROMETHEUS",
        drill: { kind: "ADMIN_ROUTE", target: "/admin/ai-ops" },
        reason: null,
        deployStrip: null,
      },
      {
        id: "outbound-resilience",
        title: "Outbound resilience",
        status: "OK",
        metric: { value: 0, unit: "errors", label: "current" },
        thresholds: { warn: 1, crit: 8 },
        lastCheckedAt: GENERATED_AT,
        source: "IN_PROCESS",
        drill: null,
        reason: null,
        deployStrip: null,
      },
      {
        id: "deploy_attempts_strip",
        title: "Deploy attempts",
        status: "OK",
        metric: null,
        thresholds: null,
        lastCheckedAt: GENERATED_AT,
        source: "FILE",
        drill: null,
        reason: null,
        deployStrip: [
          {
            attemptId: "deploy-sample-001",
            startedAt: GENERATED_AT,
            endedAt: GENERATED_AT,
            finalStatus: "SUCCEEDED",
            imageTag: "readmates-api:sample",
            durationSeconds: 90,
          },
        ],
      },
    ],
  }));
}

async function routeAdminApprovedAudit(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/audit/events**", fulfillAudit);
  await page.route("**/api/admin/audit/events**", fulfillAudit);
}

async function fulfillAudit(route: Route): Promise<void> {
  if (route.request().method() !== "GET") {
    await route.fallback();
    return;
  }
  const firstPage = buildAdminApprovedAuditEvents();
  const nextItem = {
    ...firstPage.items[0],
    id: "audit-visual-2",
    occurredAt: "2026-08-26T09:20:00Z",
    actionType: "FEEDBACK_DOCUMENT_PUBLISHED",
    actionCategory: "CLUB_LIFECYCLE" as const,
    sourceSlice: "S3" as const,
    summary: "공개 기록 확인 완료",
  };
  const cursor = new URL(route.request().url()).searchParams.get("cursor");
  if (cursor === firstPage.nextCursor) {
    await json(route, 200, {
      ...firstPage,
      items: [nextItem],
      nextCursor: null,
      summary: { ...firstPage.summary, visibleCount: 1 },
    });
    return;
  }
  await json(route, 200, firstPage);
}
