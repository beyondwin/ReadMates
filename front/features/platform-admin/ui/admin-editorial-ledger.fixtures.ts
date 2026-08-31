import type { AdminAuditLedgerItem, AdminAuditLedgerPage } from "@/features/platform-admin/model/platform-admin-audit-model";
import type { PlatformAdminCapability } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { GlobalSpaceSwitcherOption } from "@/shared/ui/global-space-switcher";
import type {
  HealthCard,
  PlatformHealthSnapshot,
} from "@/features/platform-admin/model/platform-admin-health-model";
import type {
  AdminOperationCaseView,
  AdminOperationsSearchMode,
  AdminOperationsView,
  AdminOperationSourceFreshnessView,
  AdminOperationsWorkViewId,
} from "@/features/platform-admin/model/platform-admin-operations-model";
import type { AdminSafeActionState } from "./admin-action-dock";
import type { AdminClubsLedgerClub, AdminClubsLedgerFilters } from "./admin-clubs-ledger";
import type { AdminTodayFilters } from "./admin-today-controls";

export const EDITORIAL_LEDGER_LONG_TODAY_TITLE =
  "경계가 긴 한글 운영 신호와 A deliberately long English operations signal without clipping";
export const EDITORIAL_LEDGER_LONG_CLUB_NAME =
  "경계가 긴 한글 클럽 이름과 A deliberately long English club name without clipping";
export const EDITORIAL_LEDGER_LONG_AUDIT_SUMMARY =
  "경계가 긴 한글 감사 기록과 A deliberately long English audit record without clipping";
export const EDITORIAL_LEDGER_LONG_HEALTH_TITLE =
  "경계가 긴 한글 서비스 신호와 A deliberately long English health signal without clipping";

export const TODAY_VIEW_CAPABILITIES = ["VIEW_TODAY"] as const satisfies readonly PlatformAdminCapability[];
export const CLUBS_CREATE_CAPABILITIES = [
  "VIEW_CLUBS",
  "VIEW_CLUB_OPERATIONS",
  "CREATE_CLUB",
] as const satisfies readonly PlatformAdminCapability[];
export const HEALTH_READ_CAPABILITIES = [
  "VIEW_SERVICE_HEALTH",
] as const satisfies readonly PlatformAdminCapability[];
export const AUDIT_REVIEW_CAPABILITIES = ["VIEW_AUDIT"] as const satisfies readonly PlatformAdminCapability[];
export const NOTIFICATION_REPLAY_CAPABILITIES = [
  "VIEW_NOTIFICATION_OPERATIONS",
  "REPLAY_NOTIFICATIONS",
] as const satisfies readonly PlatformAdminCapability[];
export const NOTIFICATION_VIEW_ONLY_CAPABILITIES = [
  "VIEW_NOTIFICATION_OPERATIONS",
] as const satisfies readonly PlatformAdminCapability[];

export const ADMIN_SHELL_VISUAL_CAPABILITIES: PlatformAdminCapabilities = {
  schemaVersion: 1,
  role: "OPERATOR",
  status: "ACTIVE",
  capabilities: [
    "VIEW_TODAY",
    "VIEW_CLUBS",
    "VIEW_SERVICE_HEALTH",
    "VIEW_AUDIT",
  ],
  generatedAt: "2026-08-26T10:00:00Z",
};

export const ADMIN_SHELL_VISUAL_SPACE_OPTIONS: readonly GlobalSpaceSwitcherOption[] = [
  { identity: { productSpace: "platform" } },
  {
    identity: {
      productSpace: "clubs",
      clubId: "club-editorial",
      clubSlug: "editorial-room",
      perspective: "member",
    },
    clubName: "읽는사이",
  },
  {
    identity: {
      productSpace: "clubs",
      clubId: "club-editorial",
      clubSlug: "editorial-room",
      perspective: "host",
    },
    clubName: "읽는사이",
  },
];

export const ADMIN_SHELL_LONG_COPY =
  "운영자가 바로 판단할 수 있도록 긴 한국어 안내와 a deliberately long English operational summary를 한 줄도 잃지 않고 보여 줍니다";

type TodayLifecycleAction = AdminOperationCaseView["allowedActions"][number];

export const TODAY_L1_ALLOWED_ACTIONS = [
  "ACKNOWLEDGE",
  "SNOOZE",
  "RESOLVE",
] as const satisfies readonly TodayLifecycleAction[];

const GENERATED_AT = "2026-08-26T10:00:00Z";
const noop = () => undefined;

export type TodayHistoryEvent = {
  fromState: string | null;
  toState: string;
  action: string | null;
  reasonCode: string;
  occurredAt: string;
  caseVersion: number;
};

export type TodayLedgerFixture = {
  capabilities: readonly PlatformAdminCapability[];
  allowedActions: readonly TodayLifecycleAction[];
  view: AdminOperationsView;
  filters: AdminTodayFilters;
  history: readonly TodayHistoryEvent[];
  actionState: AdminSafeActionState;
  actionReason?: string;
  pendingCount: number;
  urgentCount: number;
  urgentAnnouncement: string | null;
  hasNextPage: boolean;
  loadingMore: boolean;
  mode?: AdminOperationsSearchMode;
  query: string;
  workView: AdminOperationsWorkViewId;
};

export type ClubsLedgerFixture = {
  capabilities: readonly PlatformAdminCapability[];
  clubs: readonly AdminClubsLedgerClub[];
  filters: AdminClubsLedgerFilters;
  searchDraft: string;
  pageState: "ready" | "empty" | "loading" | "unavailable";
  canCreateClub: boolean;
  onboardingHref: string;
  focusId: string | null;
  scrollTop: number;
  hasNextPage: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
};

export type HealthLedgerFixture = {
  capabilities: readonly PlatformAdminCapability[];
  snapshot: PlatformHealthSnapshot | null;
  loading: boolean;
  error: boolean;
  fetching: boolean;
};

export type ReviewAuditFixture = {
  capabilities: readonly PlatformAdminCapability[];
  page: AdminAuditLedgerPage | null;
  selectedId: string | null;
  detailOpen: boolean;
  nextPageError: boolean;
  loadingMore: boolean;
  canSearchSensitive: boolean;
};

type TodayFixtureInput = {
  capabilities: readonly PlatformAdminCapability[];
  allowedActions: readonly TodayLifecycleAction[];
  title?: string;
  items?: readonly AdminOperationCaseView[];
  selectedCase?: AdminOperationCaseView | null;
  sources?: readonly AdminOperationSourceFreshnessView[];
  actionState?: AdminSafeActionState;
  actionReason?: string;
  pendingCount?: number;
  urgentCount?: number;
  urgentAnnouncement?: string | null;
  hasNextPage?: boolean;
  loadingMore?: boolean;
  mode?: AdminOperationsSearchMode;
  query?: string;
  workView?: AdminOperationsWorkViewId;
  history?: readonly TodayHistoryEvent[];
  emptyItems?: boolean;
};

function todayCase(input: {
  allowedActions: readonly TodayLifecycleAction[];
  title?: string;
  id?: string;
}): AdminOperationCaseView {
  return {
    id: input.id ?? "case-notification",
    sourceType: "NOTIFICATION",
    clubId: null,
    state: "OPEN",
    severity: "CRITICAL",
    summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
    firstObservedAt: "2026-08-26T08:00:00Z",
    lastObservedAt: "2026-08-26T09:55:00Z",
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: true,
    reopenCount: 0,
    version: 3,
    impactCount: 2,
    detailHref: "/admin/notifications?focus=delivery",
    allowedActions: [...input.allowedActions],
    source: {
      sourceType: "NOTIFICATION",
      status: "AVAILABLE",
      generatedAt: GENERATED_AT,
      lastSuccessfulAt: GENERATED_AT,
      authoritative: true,
    },
    summary: {
      title: input.title ?? EDITORIAL_LEDGER_LONG_TODAY_TITLE,
      description: "같은 원인의 실패가 여러 지역에서 반복되고 있습니다. Review the delivery ledger, confirm the latest authoritative observation, and keep the current case open until the operator deliberately chooses the next item.",
    },
    severityLabel: "긴급",
    stateLabel: "미확인",
    sourceLabel: "알림",
    impactLabel: "영향 2건",
    ageLabel: "2시간 전",
  };
}

const availableSource = (
  sourceType: AdminOperationSourceFreshnessView["sourceType"],
  labels: Pick<AdminOperationSourceFreshnessView, "sourceLabel" | "statusLabel" | "message">,
): AdminOperationSourceFreshnessView => ({
  sourceType,
  status: "AVAILABLE",
  generatedAt: GENERATED_AT,
  lastSuccessfulAt: GENERATED_AT,
  authoritative: true,
  canRetry: false,
  ...labels,
});

const WORK_VIEWS: AdminOperationsView["workViews"] = [
  { id: "briefing", label: "오늘의 브리핑", count: 1 },
  { id: "mine", label: "내 담당", count: 1 },
  { id: "snoozed", label: "보류", count: 0 },
  { id: "resolved-today", label: "오늘 해결", count: null },
];

function todayFixture(input: TodayFixtureInput): TodayLedgerFixture {
  const selectedCase = input.emptyItems
    ? null
    : input.selectedCase === undefined
      ? todayCase({ allowedActions: input.allowedActions, title: input.title })
      : input.selectedCase;
  const items = input.emptyItems
    ? []
    : input.items
      ? [...input.items]
      : selectedCase
        ? [selectedCase]
        : [];
  const sources = input.sources
    ? [...input.sources]
    : [
        availableSource("NOTIFICATION", {
          sourceLabel: "알림",
          statusLabel: "정상",
          message: "정상",
        }),
      ];
  const allSourcesAvailable = sources.every((source) => source.status === "AVAILABLE");

  return {
    capabilities: [...input.capabilities],
    allowedActions: [...input.allowedActions],
    view: {
      generatedAt: GENERATED_AT,
      generatedAtLabel: "19:00",
      items,
      selectedCase,
      selectedCaseId: selectedCase?.id ?? null,
      selectionFellBack: false,
      sources,
      mobileSummary: {
        open: items.length > 0 ? "활성 1건" : "활성 0건",
        critical: items.length > 0 ? "긴급 1건" : "긴급 0건",
        assignedToMe: items.length > 0 ? "내 담당 1건" : "내 담당 0건",
        snoozed: "보류 0건",
        label: items.length > 0
          ? "활성 1건 · 긴급 1건 · 내 담당 1건 · 보류 0건"
          : "활성 0건 · 긴급 0건 · 내 담당 0건 · 보류 0건",
      },
      allSourcesAvailable,
      sourceStatusLabel: allSourcesAvailable ? "전체 신호 정상" : "일부 신호 확인 불가",
      workViews: WORK_VIEWS,
      nextCursor: input.hasNextPage ? "cursor-2" : null,
    },
    filters: { state: "", severity: "", source: "", assignee: "" },
    history: input.history
      ? [...input.history]
      : selectedCase
        ? [{
            fromState: null,
            toState: "OPEN",
            action: null,
            reasonCode: "SIGNAL_OPENED",
            occurredAt: "2026-08-26T08:00:00Z",
            caseVersion: 1,
          }]
        : [],
    actionState: input.actionState ?? "ready",
    actionReason: input.actionReason,
    pendingCount: input.pendingCount ?? 0,
    urgentCount: input.urgentCount ?? 0,
    urgentAnnouncement: input.urgentAnnouncement ?? null,
    hasNextPage: input.hasNextPage ?? false,
    loadingMore: input.loadingMore ?? false,
    mode: input.mode,
    query: input.query ?? "",
    workView: input.workView ?? "briefing",
  };
}

export const todayDesktopLedger = todayFixture({
  capabilities: TODAY_VIEW_CAPABILITIES,
  allowedActions: TODAY_L1_ALLOWED_ACTIONS,
});

export const todayMobileCaseDetail = todayFixture({
  capabilities: TODAY_VIEW_CAPABILITIES,
  allowedActions: TODAY_L1_ALLOWED_ACTIONS,
  mode: "detail",
});

export const todayEmptyEvidence = todayFixture({
  capabilities: TODAY_VIEW_CAPABILITIES,
  allowedActions: [],
  emptyItems: true,
  sources: [],
});

export const todayFailedSources = todayFixture({
  capabilities: TODAY_VIEW_CAPABILITIES,
  allowedActions: TODAY_L1_ALLOWED_ACTIONS,
  sources: [
    {
      sourceType: "NOTIFICATION",
      status: "PARTIAL",
      generatedAt: GENERATED_AT,
      lastSuccessfulAt: "2026-08-26T09:20:00Z",
      authoritative: true,
      canRetry: false,
      sourceLabel: "알림",
      statusLabel: "일부 확인 불가",
      message: "일부 확인 불가 · 마지막 정상 18:20",
    },
    {
      sourceType: "AI_JOB",
      status: "UNAVAILABLE",
      generatedAt: GENERATED_AT,
      lastSuccessfulAt: "2026-08-26T08:10:00Z",
      authoritative: false,
      canRetry: true,
      sourceLabel: "AI 작업",
      statusLabel: "확인 불가",
      message: "확인 불가 · 마지막 정상 17:10",
    },
    {
      sourceType: "CLOSING_RISK",
      status: "UNAVAILABLE",
      generatedAt: GENERATED_AT,
      lastSuccessfulAt: null,
      authoritative: false,
      canRetry: true,
      sourceLabel: "모임 마감",
      statusLabel: "확인 불가",
      message: "확인 불가",
    },
  ],
});

export const todayPendingNew = todayFixture({
  capabilities: TODAY_VIEW_CAPABILITIES,
  allowedActions: TODAY_L1_ALLOWED_ACTIONS,
  pendingCount: 2,
  urgentCount: 1,
  urgentAnnouncement: "새 긴급 신호 1건",
});

export const todayUnknownOutcome = todayFixture({
  capabilities: TODAY_VIEW_CAPABILITIES,
  allowedActions: TODAY_L1_ALLOWED_ACTIONS,
  actionState: "unknown-outcome",
  actionReason: "결과를 확인하지 못했습니다. 최신 근거를 다시 읽은 뒤 재확인해 주세요.",
});

export const todayEmptyAllowedActions = todayFixture({
  capabilities: TODAY_VIEW_CAPABILITIES,
  allowedActions: [],
});

function clubsFixture(input: {
  capabilities: readonly PlatformAdminCapability[];
  clubs?: readonly AdminClubsLedgerClub[];
  pageState?: ClubsLedgerFixture["pageState"];
  hasNextPage?: boolean;
  loadMoreError?: boolean;
}): ClubsLedgerFixture {
  const clubs = input.clubs ? [...input.clubs] : [criticalClub(), healthyClub()];
  return {
    capabilities: [...input.capabilities],
    clubs,
    filters: {},
    searchDraft: "",
    pageState: input.pageState ?? "ready",
    canCreateClub: input.capabilities.includes("CREATE_CLUB"),
    onboardingHref: "/admin/clubs?onboarding=1",
    focusId: null,
    scrollTop: 0,
    hasNextPage: input.hasNextPage ?? false,
    loadingMore: false,
    loadMoreError: input.loadMoreError ?? false,
  };
}

function criticalClub(): AdminClubsLedgerClub {
  return {
    clubId: "club-1",
    name: EDITORIAL_LEDGER_LONG_CLUB_NAME,
    href: "/admin/clubs/club-1?returnTo=%2Fadmin%2Fclubs&focusId=club-1&scrollTop=0",
    currentState: "활성 · 비공개",
    requiredAction: "실패 신호 확인",
    recentSignal: "알림 실패 2건 · 도메인 조치 필요",
    emphasis: "actionable",
    technicalDisclosure: [
      { label: "클럽 ID", value: "club-1" },
      { label: "Slug", value: "broken" },
      { label: "수명주기 값", value: "ACTIVE" },
      { label: "공개 상태 값", value: "PRIVATE" },
    ],
  };
}

function healthyClub(): AdminClubsLedgerClub {
  return {
    clubId: "club-2",
    name: "읽는사이 Healthy Club",
    href: "/admin/clubs/club-2?returnTo=%2Fadmin%2Fclubs&focusId=club-2&scrollTop=0",
    currentState: "활성 · 공개",
    requiredAction: null,
    recentSignal: null,
    emphasis: "quiet",
    technicalDisclosure: [
      { label: "클럽 ID", value: "club-2" },
      { label: "Slug", value: "healthy" },
      { label: "수명주기 값", value: "ACTIVE" },
      { label: "공개 상태 값", value: "PUBLIC" },
    ],
  };
}

export const clubsTabletLedger = clubsFixture({
  capabilities: CLUBS_CREATE_CAPABILITIES,
});

export const clubsPaginationFailure = clubsFixture({
  capabilities: CLUBS_CREATE_CAPABILITIES,
  hasNextPage: true,
  loadMoreError: true,
});

export const clubsEmptyEvidence = clubsFixture({
  capabilities: CLUBS_CREATE_CAPABILITIES,
  clubs: [],
  pageState: "empty",
});

function healthCard(overrides: Partial<HealthCard> & Pick<HealthCard, "id" | "title">): HealthCard {
  return {
    status: "OK",
    metric: { value: 1, unit: "rows", label: "pending" },
    thresholds: { warn: 100, crit: 1000 },
    lastCheckedAt: GENERATED_AT,
    source: "IN_PROCESS",
    drill: null,
    reason: null,
    deployStrip: null,
    ...overrides,
  };
}

const HEALTH_SNAPSHOT: PlatformHealthSnapshot = {
  schema: "platform.health_snapshot.v1",
  generatedAt: GENERATED_AT,
  lastSuccessfulAt: GENERATED_AT,
  refreshState: "FRESH",
  staleAgeSeconds: 0,
  cards: [
    healthCard({
      id: "outbox_backlog",
      title: "Outbox backlog",
      metric: { value: 42, unit: "rows", label: "pending" },
      drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications?focus=outbox_backlog" },
    }),
    healthCard({
      id: "kafka_consumer_lag",
      title: EDITORIAL_LEDGER_LONG_HEALTH_TITLE,
      status: "WARN",
      metric: { value: 75, unit: "records", label: "max across partitions" },
      thresholds: { warn: 50, crit: 500 },
      source: "PROMETHEUS",
    }),
    healthCard({
      id: "redis",
      title: "Redis",
      status: "UNKNOWN",
      metric: null,
      reason: "redis_metrics_unavailable",
    }),
    healthCard({
      id: "db_pool",
      title: "DB pool",
      metric: { value: 3, unit: "connections", label: "active" },
    }),
    healthCard({
      id: "notification_dispatch_success",
      title: "Notification dispatch success",
      metric: { value: 0.997, unit: "ratio", label: "last 5m" },
      source: "PROMETHEUS",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications" },
    }),
    healthCard({
      id: "ai_provider_availability",
      title: "AI provider availability",
      source: "PROMETHEUS",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/ai-ops" },
    }),
    healthCard({
      id: "deploy_attempts_strip",
      title: "Deploy attempts",
      metric: null,
      thresholds: null,
      source: "FILE",
      deployStrip: [
        {
          attemptId: "deploy-dev-001",
          startedAt: GENERATED_AT,
          endedAt: "2026-08-26T10:02:00Z",
          finalStatus: "SUCCEEDED",
          imageTag: "readmates-api:dev-20260826",
          durationSeconds: 120,
        },
      ],
    }),
  ],
};

export const serviceHealthLedger: HealthLedgerFixture = {
  capabilities: [...HEALTH_READ_CAPABILITIES],
  snapshot: HEALTH_SNAPSHOT,
  loading: false,
  error: false,
  fetching: false,
};

export const healthEmptyEvidence: HealthLedgerFixture = {
  capabilities: [...HEALTH_READ_CAPABILITIES],
  snapshot: null,
  loading: false,
  error: true,
  fetching: false,
};

function auditItem(overrides: Partial<AdminAuditLedgerItem> & Pick<AdminAuditLedgerItem, "id" | "summary">): AdminAuditLedgerItem {
  return {
    occurredAt: "2026-08-26T10:01:00Z",
    sourceSlice: "S5",
    sourceTable: "platform_audit_events",
    actionCategory: "NOTIFICATION",
    actionType: "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
    outcome: "SUCCESS",
    actor: { userId: "platform-owner-user", role: "OWNER", displayLabel: "OWNER" },
    target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
    safeMetadata: [{ label: "selectionHashPrefix", value: "aaaaaaaa", kind: "fingerprint" }],
    metadataState: "AVAILABLE",
    ...overrides,
  };
}

const REVIEW_PAGE: AdminAuditLedgerPage = {
  generatedAt: GENERATED_AT,
  filters: { range: "7d" },
  summary: { visibleCount: 2, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
  nextCursor: "cursor-2",
  items: [
    auditItem({
      id: "platform_audit_events:event-1",
      summary: EDITORIAL_LEDGER_LONG_AUDIT_SUMMARY,
    }),
    auditItem({
      id: "platform_audit_events:event-2",
      occurredAt: "2026-08-26T10:00:00Z",
      sourceSlice: "S4",
      actionCategory: "SUPPORT",
      actionType: "SUPPORT_ACCESS_GRANT_CREATED",
      outcome: "FAILED",
      target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "사용자 숨김" },
      summary: "support grant가 생성되었습니다.",
      safeMetadata: [{ label: "scope", value: "METADATA_READ", kind: "code" }],
    }),
  ],
};

export const reviewAuditLedger: ReviewAuditFixture = {
  capabilities: [...AUDIT_REVIEW_CAPABILITIES],
  page: REVIEW_PAGE,
  selectedId: "platform_audit_events:event-1",
  detailOpen: true,
  nextPageError: false,
  loadingMore: false,
  canSearchSensitive: false,
};

export const reviewAuditPaginationFailure: ReviewAuditFixture = {
  capabilities: [...AUDIT_REVIEW_CAPABILITIES],
  page: REVIEW_PAGE,
  selectedId: "platform_audit_events:event-1",
  detailOpen: false,
  nextPageError: true,
  loadingMore: false,
  canSearchSensitive: false,
};

export const reviewAuditEmptyEvidence: ReviewAuditFixture = {
  capabilities: [...AUDIT_REVIEW_CAPABILITIES],
  page: {
    ...REVIEW_PAGE,
    summary: { visibleCount: 0, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
    nextCursor: null,
    items: [],
  },
  selectedId: null,
  detailOpen: false,
  nextPageError: false,
  loadingMore: false,
  canSearchSensitive: false,
};

export const noopEditorialLedgerHandler = noop;
