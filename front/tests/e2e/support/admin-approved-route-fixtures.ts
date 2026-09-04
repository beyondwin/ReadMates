import type { Page, Route } from "@playwright/test";
import type { AdminOperationAction, AdminOperationCase } from "@/features/platform-admin/api/platform-admin-operations-contracts";
import type { AdminOperationCasePresentation } from "@/features/platform-admin/model/platform-admin-operations-model";
import type { PlatformAdminCapability } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import {
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

const ADMIN_APPROVED_FIXTURE_KEYS = new Set<ApprovedRouteFixtureKey>(["admin-today"]);

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

export function buildAdminTodayOperationCases(): AdminOperationCase[] {
  return [
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

async function routeAdminTodayPriorityCases(page: Page): Promise<void> {
  const items = buildAdminTodayOperationCases();
  const byId = new Map(items.map((item) => [item.id, item]));
  const sources = [
    availableSource("NOTIFICATION"),
    availableSource("CLOSING_RISK"),
    availableSource("AI_JOB"),
    availableSource("CLUB_READINESS"),
  ];

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
    return json(route, 200, {
      schema: "admin.operation_cases.v1",
      generatedAt: GENERATED_AT,
      counts: { open: items.length, critical: 3, assignedToMe: items.length, snoozed: 0 },
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
): Promise<void> {
  if (!ADMIN_APPROVED_FIXTURE_KEYS.has(fixtureKey)) {
    throw new Error(`Unsupported Admin fixture key: ${fixtureKey}`);
  }

  for (const path of ADMIN_TODAY_FIXTURE_PATHS) {
    requestAudit.allowFixture({ method: "GET", path });
  }
  requestAudit.allowFixture({ method: "POST", path: FRONTEND_OBSERVABILITY_PATH });
  for (const item of buildAdminTodayOperationCases()) {
    requestAudit.allowFixture({
      method: "GET",
      path: `/api/bff/api/admin/operations/cases/${item.id}`,
    });
  }

  await routeAdminEditorialLedgerShell(page, {
    capabilities: ADMIN_TODAY_CAPABILITIES,
    authRole: "OPERATOR",
  });
  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, buildAdminApprovedAuth()));
  await routeAdminHealthSnapshot(page);
  await routeAdminTodayHealthySnapshot(page);
  await routeAdminTodayCases(page, { allowedActions: TODAY_LIFECYCLE_ACTIONS });
  await routeAdminTodayPriorityCases(page);
  await page.route("**/api/bff/observability/frontend-events", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({ status: 204 });
  });
}
