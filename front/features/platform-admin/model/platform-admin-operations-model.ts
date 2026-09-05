import type {
  AdminOperationAction,
  AdminOperationAssigneeFilter,
  AdminOperationCase,
  AdminOperationCaseCounts,
  AdminOperationCaseFilter,
  AdminOperationCaseState,
  AdminOperationCasesResponse,
  AdminOperationSeverity,
  AdminOperationSourceFreshness,
  AdminOperationSourceType,
  AdminOperationSummaryCode,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import {
  adminCaseLifecycleLanguage,
  adminHealthAvailabilityLanguage,
  adminOperationActionLanguage,
} from "@/features/platform-admin/model/admin-status-language";

const CASE_STATES: readonly AdminOperationCaseState[] = [
  "OPEN",
  "ACKNOWLEDGED",
  "SNOOZED",
  "RESOLVED",
];
const SEVERITIES: readonly AdminOperationSeverity[] = ["CRITICAL", "WARNING", "READY", "INFO"];
const SOURCE_TYPES: readonly AdminOperationSourceType[] = [
  "CLUB_READINESS",
  "NOTIFICATION",
  "AI_JOB",
  "CLOSING_RISK",
];
const ASSIGNEES: readonly AdminOperationAssigneeFilter[] = ["ME"];
const WORK_VIEW_IDS = ["briefing", "mine", "snoozed", "resolved-today"] as const;
const SEARCH_MODES = ["list", "detail"] as const;
const QUEUE_DISCLOSURE_MODES = ["priority", "all"] as const;

export const ADMIN_TODAY_PRIORITY_LIMIT = 3;

const NOTIFICATION_DELAY_ACTION_COPY: Record<AdminOperationAction, string> = {
  ACKNOWLEDGE: "다시 보내기 검토",
  SNOOZE: "30분 뒤 다시 보기",
  RESOLVE: "자세히 보기",
};

export function actionCopyFor(
  sourceType: AdminOperationSourceType,
  action: AdminOperationAction,
): string {
  return sourceType === "NOTIFICATION"
    ? NOTIFICATION_DELAY_ACTION_COPY[action]
    : adminOperationActionLanguage(action).primaryText;
}

const SUMMARY_LABELS: Record<AdminOperationSummaryCode, AdminOperationSummaryLabel> = {
  CLUB_SETUP_REQUIRED: {
    title: "클럽 설정이 필요합니다",
    description: "공개 전 필수 조건을 확인하세요.",
  },
  CLUB_DOMAIN_ACTION_REQUIRED: {
    title: "도메인 확인이 필요합니다",
    description: "연결 상태를 확인하세요.",
  },
  CLUB_READY_TO_PUBLISH: {
    title: "클럽이 공개 준비를 마쳤습니다",
    description: "클럽 상세에서 조건을 검토하세요.",
  },
  NOTIFICATION_DELIVERY_FAILURE: {
    title: "알림 전달 실패가 반복되고 있습니다",
    description: "같은 원인의 실패를 확인하세요.",
  },
  NOTIFICATION_PLATFORM_BACKLOG: {
    title: "알림 처리 지연이 감지되었습니다",
    description: "알림 운영 상태를 확인하세요.",
  },
  AI_JOB_FAILED: {
    title: "AI 작업이 실패했습니다",
    description: "안전한 작업 정보만 확인합니다.",
  },
  AI_JOB_STALE: {
    title: "AI 작업 갱신이 지연되고 있습니다",
    description: "작업 상태를 확인하세요.",
  },
  SESSION_CLOSING_BLOCKED: {
    title: "모임 마감이 완료되지 않았습니다",
    description: "호스트 클로징 보드를 확인하세요.",
  },
};

const UNKNOWN_SUMMARY_LABEL: AdminOperationSummaryLabel = {
  title: "운영 상태 확인 필요",
  description: "안전한 운영 상세에서 상태를 확인하세요.",
};

const SEVERITY_LABELS: Record<AdminOperationSeverity, string> = {
  CRITICAL: "긴급",
  WARNING: "경고",
  READY: "준비",
  INFO: "정보",
};

const SOURCE_LABELS: Record<AdminOperationSourceType, string> = {
  CLUB_READINESS: "클럽 준비",
  NOTIFICATION: "알림",
  AI_JOB: "AI 작업",
  CLOSING_RISK: "모임 마감",
};

const SEOUL_TIME = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

const SEOUL_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type AdminOperationsWorkViewId = (typeof WORK_VIEW_IDS)[number];

export type AdminOperationsSearchMode = (typeof SEARCH_MODES)[number];

export type AdminQueueDisclosureMode = (typeof QUEUE_DISCLOSURE_MODES)[number];

export type AdminOperationsSearchState = {
  caseId: string | null;
  mode: AdminOperationsSearchMode;
  workView: AdminOperationsWorkViewId;
  query: string;
  filter: AdminOperationCaseFilter;
  queueDisclosure: AdminQueueDisclosureMode;
};

type AdminOperationsSearchInput = Pick<AdminOperationsSearchState, "caseId" | "filter"> &
  Partial<Pick<AdminOperationsSearchState, "mode" | "workView" | "query" | "queueDisclosure">>;

export type AdminOperationSummaryLabel = {
  title: string;
  description: string;
};

export type AdminOperationCaseView = AdminOperationCase & {
  locatorLabel?: string;
  scopeLabel?: string;
  mobileMetaLabel?: string;
  summary: AdminOperationSummaryLabel;
  severityLabel: string;
  stateLabel: string;
  sourceLabel: string;
  impactLabel: string;
  ageLabel: string;
  lastObservedLabel?: string;
  evidenceLines?: readonly string[];
  recommendation?: string;
};

export type AdminOperationWorkView = {
  id: AdminOperationsWorkViewId;
  label: string;
  count: number | null;
};

export type AdminOperationSourceFreshnessView = AdminOperationSourceFreshness & {
  sourceLabel: string;
  statusLabel: string;
  message: string;
  canRetry: boolean;
};

export type AdminOperationMobileSummary = {
  open: string;
  critical: string;
  assignedToMe: string;
  snoozed: string;
  label: string;
};

export type AdminOperationsView = {
  generatedAt: string;
  generatedAtLabel: string;
  items: AdminOperationCaseView[];
  selectedCase: AdminOperationCaseView | null;
  selectedCaseId: string | null;
  selectionExcluded?: boolean;
  selectionFellBack: boolean;
  sources: AdminOperationSourceFreshnessView[];
  workViews?: AdminOperationWorkView[];
  mobileSummary: AdminOperationMobileSummary;
  allSourcesAvailable: boolean;
  sourceStatusLabel: string;
  nextCursor: string | null;
};

export function parseAdminOperationsSearch(params: URLSearchParams): AdminOperationsSearchState {
  const states = parseAllowedList(params.get("state"), CASE_STATES);
  const severities = parseAllowedList(params.get("severity"), SEVERITIES);
  const sources = parseAllowedList(params.get("source"), SOURCE_TYPES);
  const assignee = parseAllowedValue(params.get("assignee"), ASSIGNEES);
  const cursor = nonBlank(params.get("cursor"));

  return {
    caseId: nonBlank(params.get("case")),
    mode: parseSearchMode(params.get("mode")),
    workView: parseWorkView(params.get("view")),
    query: nonBlank(params.get("q")) ?? "",
    filter: {
      ...(states.length > 0 ? { states } : {}),
      ...(severities.length > 0 ? { severities } : {}),
      ...(sources.length > 0 ? { sources } : {}),
      ...(assignee ? { assignee } : {}),
      ...(cursor ? { cursor } : {}),
    },
    queueDisclosure: parseQueueDisclosure(params.get("queue")),
  };
}

export function serializeAdminOperationsSearch(state: AdminOperationsSearchInput): URLSearchParams {
  const params = new URLSearchParams();
  const caseId = nonBlank(state.caseId);
  const workView = parseWorkView(state.workView ?? null);
  const query = nonBlank(state.query ?? null);
  const mode = parseSearchMode(state.mode ?? null);
  const states = allowlistedValues(state.filter.states, CASE_STATES);
  const severities = allowlistedValues(state.filter.severities, SEVERITIES);
  const sources = allowlistedValues(state.filter.sources, SOURCE_TYPES);
  const assignee = parseAllowedValue(state.filter.assignee ?? null, ASSIGNEES);
  const cursor = nonBlank(state.filter.cursor ?? null);
  const queueDisclosure = state.queueDisclosure === "all" ? "all" : "priority";

  if (caseId) params.set("case", caseId);
  if (workView !== "briefing") params.set("view", workView);
  if (query) params.set("q", query);
  if (mode !== "list") params.set("mode", mode);
  setListParam(params, "state", states);
  setListParam(params, "severity", severities);
  setListParam(params, "source", sources);
  if (assignee) params.set("assignee", assignee.toLowerCase());
  if (cursor) params.set("cursor", cursor);
  if (queueDisclosure === "all") params.set("queue", "all");
  return params;
}

export function adminOperationsScopeKey(
  workView: AdminOperationsWorkViewId,
  filter: AdminOperationCaseFilter,
): string {
  return JSON.stringify({
    workView,
    states: allowlistedValues(filter.states, CASE_STATES),
    severities: allowlistedValues(filter.severities, SEVERITIES),
    sources: allowlistedValues(filter.sources, SOURCE_TYPES),
    assignee: parseAllowedValue(filter.assignee ?? null, ASSIGNEES) ?? null,
    limit: typeof filter.limit === "number" ? filter.limit : null,
  });
}

export function effectiveAdminOperationsFilter(
  state: AdminOperationsSearchState,
): AdminOperationCaseFilter {
  const workViewFilter: AdminOperationCaseFilter = state.workView === "mine"
    ? { states: ["OPEN", "ACKNOWLEDGED", "SNOOZED"], assignee: "ME" }
    : state.workView === "snoozed"
      ? { states: ["SNOOZED"] }
      : state.workView === "resolved-today"
        ? { states: ["RESOLVED"] }
        : { states: ["OPEN", "ACKNOWLEDGED"] };
  return mergeOperationFilters(workViewFilter, state.filter);
}

export function buildAdminOperationWorkViews(
  counts: AdminOperationCaseCounts,
): AdminOperationWorkView[] {
  return [
    { id: "briefing", label: "오늘의 브리핑", count: Math.max(0, counts.open - counts.snoozed) },
    { id: "mine", label: "내 담당", count: counts.assignedToMe },
    { id: "snoozed", label: "보류", count: counts.snoozed },
    { id: "resolved-today", label: "오늘 해결", count: null },
  ];
}

export function filterAdminOperationItems(
  items: readonly AdminOperationCaseView[],
  state: AdminOperationsSearchState,
  now: Date,
): AdminOperationCaseView[] {
  const today = seoulDateKey(now);
  const query = state.query.trim().toLocaleLowerCase("ko-KR");
  return items.filter((item) => {
    if (state.workView === "resolved-today") {
      if (!item.resolvedAt || seoulDateKey(new Date(item.resolvedAt)) !== today) return false;
    }
    if (!query) return true;
    return [item.summary.title, item.sourceLabel, item.scopeLabel ?? ""]
      .some((value) => value.toLocaleLowerCase("ko-KR").includes(query));
  });
}

export function adminOperationSummaryLabel(code: string): AdminOperationSummaryLabel {
  if (Object.hasOwn(SUMMARY_LABELS, code)) {
    return SUMMARY_LABELS[code as AdminOperationSummaryCode];
  }
  return UNKNOWN_SUMMARY_LABEL;
}

export function buildAdminOperationsView(
  response: AdminOperationCasesResponse,
  requestedCaseId: string | null,
  now?: Date,
  clubNames: ReadonlyMap<string, string> = new Map(),
  orderMode: "sorted" | "preserve" = "sorted",
): AdminOperationsView {
  const clock = now ?? new Date(response.generatedAt);
  const caseViews = response.items.map((item) => buildCaseView(item, clock, clubNames));
  const orderedItems = orderMode === "preserve" ? caseViews : [...caseViews].sort(compareOperationCases);
  const items = orderedItems.map((item, index) => ({
    ...item,
    locatorLabel: String(orderedItems.length - index).padStart(2, "0"),
  }));
  const requested = requestedCaseId
    ? items.find((item) => item.id === requestedCaseId) ?? null
    : null;
  const selectionExcluded = requestedCaseId !== null && requested === null;
  const selectedCase = requestedCaseId === null ? items[0] ?? null : requested;
  const sources = response.sources.map(buildSourceFreshnessView);
  const allSourcesAvailable = sources.every((source) => source.status === "AVAILABLE");

  return {
    generatedAt: response.generatedAt,
    generatedAtLabel: formatTime(response.generatedAt),
    items,
    selectedCase,
    selectedCaseId: selectedCase?.id ?? null,
    selectionExcluded,
    selectionFellBack: selectionExcluded,
    sources,
    workViews: buildAdminOperationWorkViews(response.counts),
    mobileSummary: buildMobileSummary(response),
    allSourcesAvailable,
    sourceStatusLabel: allSourcesAvailable ? "전체 신호 정상" : "일부 신호 확인 불가",
    nextCursor: response.nextCursor,
  };
}

export type AdminOperationCasePresentation = {
  summaryTitle?: string;
  summaryDescription?: string;
  evidenceLines?: readonly string[];
  recommendation?: string;
  scopeLabel?: string;
  impactLabel?: string;
};

function casePresentation(item: AdminOperationCase): AdminOperationCasePresentation {
  const extra = item as AdminOperationCase & AdminOperationCasePresentation;
  return {
    summaryTitle: typeof extra.summaryTitle === "string" ? extra.summaryTitle : undefined,
    summaryDescription: typeof extra.summaryDescription === "string" ? extra.summaryDescription : undefined,
    evidenceLines: Array.isArray(extra.evidenceLines) ? extra.evidenceLines : undefined,
    recommendation: typeof extra.recommendation === "string" ? extra.recommendation : undefined,
    scopeLabel: typeof extra.scopeLabel === "string" ? extra.scopeLabel : undefined,
    impactLabel: typeof extra.impactLabel === "string" ? extra.impactLabel : undefined,
  };
}

function buildCaseView(
  item: AdminOperationCase,
  now: Date,
  clubNames: ReadonlyMap<string, string>,
): Omit<AdminOperationCaseView, "locatorLabel"> {
  const presentation = casePresentation(item);
  const labeled = adminOperationSummaryLabel(item.summaryCode);
  const scopeLabel = presentation.scopeLabel
    ?? (item.clubId ? clubNames.get(item.clubId) ?? "클럽 정보 확인 필요" : "플랫폼 전체");
  const ageLabel = formatAge(item.firstObservedAt, now);
  return {
    ...item,
    scopeLabel,
    mobileMetaLabel: `${scopeLabel} · ${ageLabel}`,
    summary: {
      title: presentation.summaryTitle ?? labeled.title,
      description: presentation.summaryDescription ?? labeled.description,
    },
    severityLabel: SEVERITY_LABELS[item.severity] ?? "상태 확인",
    stateLabel: adminCaseLifecycleLanguage(item.state).primaryText,
    sourceLabel: SOURCE_LABELS[item.sourceType] ?? "운영 신호",
    impactLabel: presentation.impactLabel ?? `영향 ${item.impactCount}건`,
    ageLabel,
    lastObservedLabel: formatTime(item.lastObservedAt),
    evidenceLines: presentation.evidenceLines,
    recommendation: presentation.recommendation,
  };
}

function mergeOperationFilters(
  base: AdminOperationCaseFilter,
  explicit: AdminOperationCaseFilter,
): AdminOperationCaseFilter {
  return {
    ...base,
    ...explicit,
    states: explicit.states?.length ? explicit.states : base.states,
    severities: explicit.severities?.length ? explicit.severities : base.severities,
    sources: explicit.sources?.length ? explicit.sources : base.sources,
    assignee: explicit.assignee ?? base.assignee,
  };
}

function buildSourceFreshnessView(
  source: AdminOperationSourceFreshness,
): AdminOperationSourceFreshnessView {
  const statusLabel = adminHealthAvailabilityLanguage(source.status).primaryText;
  let message = statusLabel;
  if (source.status === "AVAILABLE") {
    message = `${statusLabel} · ${formatTime(source.generatedAt)} 기준`;
  } else if (source.status === "PARTIAL" || source.status === "UNAVAILABLE") {
    message = source.lastSuccessfulAt
      ? `${statusLabel} · 마지막 정상 ${formatTime(source.lastSuccessfulAt)}`
      : `${statusLabel} · 정상 확인 기록 없음`;
  }

  return {
    ...source,
    sourceLabel: SOURCE_LABELS[source.sourceType] ?? "운영 신호",
    statusLabel,
    message,
    canRetry: source.status === "UNAVAILABLE",
  };
}

function buildMobileSummary(response: AdminOperationCasesResponse): AdminOperationMobileSummary {
  const open = `활성 ${response.counts.open}건`;
  const critical = `긴급 ${response.counts.critical}건`;
  const assignedToMe = `내 담당 ${response.counts.assignedToMe}건`;
  const snoozed = `보류 ${response.counts.snoozed}건`;
  return {
    open,
    critical,
    assignedToMe,
    snoozed,
    label: [open, critical, assignedToMe, snoozed].join(" · "),
  };
}

function compareOperationCases(a: AdminOperationCaseView, b: AdminOperationCaseView): number {
  return (
    SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
    timestamp(a.firstObservedAt) - timestamp(b.firstObservedAt) ||
    a.id.localeCompare(b.id)
  );
}

function formatAge(value: string, now: Date): string {
  const observedAt = timestamp(value);
  if (!Number.isFinite(observedAt)) return "시간 확인 필요";
  const elapsedMilliseconds = Math.max(0, now.getTime() - observedAt);
  const minutes = Math.floor(elapsedMilliseconds / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "시각 확인 필요" : SEOUL_TIME.format(date);
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function seoulDateKey(value: Date): string {
  const parts = SEOUL_DATE.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseWorkView(value: string | null): AdminOperationsWorkViewId {
  const normalized = value?.trim().toLocaleLowerCase("en-US");
  return normalized && WORK_VIEW_IDS.includes(normalized as AdminOperationsWorkViewId)
    ? normalized as AdminOperationsWorkViewId
    : "briefing";
}

function parseSearchMode(value: string | null): AdminOperationsSearchMode {
  const normalized = value?.trim().toLocaleLowerCase("en-US");
  return normalized && SEARCH_MODES.includes(normalized as AdminOperationsSearchMode)
    ? normalized as AdminOperationsSearchMode
    : "list";
}

function parseQueueDisclosure(value: string | null): AdminQueueDisclosureMode {
  return QUEUE_DISCLOSURE_MODES.includes(value as AdminQueueDisclosureMode)
    ? value as AdminQueueDisclosureMode
    : "priority";
}

function parseAllowedList<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return [];
  return allowlistedValues(value.split(","), allowed);
}

function allowlistedValues<T extends string>(values: readonly string[] | undefined, allowed: readonly T[]): T[] {
  const normalized = values?.map((value) => value.trim().toUpperCase()) ?? [];
  return [...new Set(normalized.filter((value): value is T => allowed.includes(value as T)))];
}

function parseAllowedValue<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && allowed.includes(normalized as T) ? (normalized as T) : undefined;
}

function setListParam(params: URLSearchParams, key: string, values: readonly string[]) {
  if (values.length > 0) params.set(key, values.map((value) => value.toLowerCase()).join(","));
}

function nonBlank(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
