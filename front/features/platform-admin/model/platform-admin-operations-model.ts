import type {
  AdminOperationAssigneeFilter,
  AdminOperationCase,
  AdminOperationCaseFilter,
  AdminOperationCaseState,
  AdminOperationCasesResponse,
  AdminOperationSeverity,
  AdminOperationSourceFreshness,
  AdminOperationSourceStatus,
  AdminOperationSourceType,
  AdminOperationSummaryCode,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";

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
    title: "회차 마감이 완료되지 않았습니다",
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

const STATE_LABELS: Record<AdminOperationCaseState, string> = {
  OPEN: "미확인",
  ACKNOWLEDGED: "확인됨",
  SNOOZED: "보류됨",
  RESOLVED: "해결됨",
};

const SOURCE_LABELS: Record<AdminOperationSourceType, string> = {
  CLUB_READINESS: "클럽 준비",
  NOTIFICATION: "알림",
  AI_JOB: "AI 작업",
  CLOSING_RISK: "회차 마감",
};

const SOURCE_STATUS_LABELS: Record<AdminOperationSourceStatus, string> = {
  AVAILABLE: "정상",
  PARTIAL: "일부 확인 불가",
  UNAVAILABLE: "확인 불가",
  DISABLED: "비활성",
};

const SEOUL_TIME = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

export type AdminOperationsSearchState = {
  caseId: string | null;
  filter: AdminOperationCaseFilter;
};

export type AdminOperationSummaryLabel = {
  title: string;
  description: string;
};

export type AdminOperationCaseView = AdminOperationCase & {
  summary: AdminOperationSummaryLabel;
  severityLabel: string;
  stateLabel: string;
  sourceLabel: string;
  impactLabel: string;
  ageLabel: string;
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
  selectionFellBack: boolean;
  sources: AdminOperationSourceFreshnessView[];
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
    filter: {
      ...(states.length > 0 ? { states } : {}),
      ...(severities.length > 0 ? { severities } : {}),
      ...(sources.length > 0 ? { sources } : {}),
      ...(assignee ? { assignee } : {}),
      ...(cursor ? { cursor } : {}),
    },
  };
}

export function serializeAdminOperationsSearch(state: AdminOperationsSearchState): URLSearchParams {
  const params = new URLSearchParams();
  const caseId = nonBlank(state.caseId);
  const states = allowlistedValues(state.filter.states, CASE_STATES);
  const severities = allowlistedValues(state.filter.severities, SEVERITIES);
  const sources = allowlistedValues(state.filter.sources, SOURCE_TYPES);
  const assignee = parseAllowedValue(state.filter.assignee ?? null, ASSIGNEES);
  const cursor = nonBlank(state.filter.cursor ?? null);

  if (caseId) params.set("case", caseId);
  setListParam(params, "state", states);
  setListParam(params, "severity", severities);
  setListParam(params, "source", sources);
  if (assignee) params.set("assignee", assignee.toLowerCase());
  if (cursor) params.set("cursor", cursor);
  return params;
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
  now: Date = new Date(),
): AdminOperationsView {
  const items = response.items
    .map((item) => buildCaseView(item, now))
    .sort(compareOperationCases);
  const requested = requestedCaseId
    ? items.find((item) => item.id === requestedCaseId) ?? null
    : null;
  const selectedCase = requested ?? items[0] ?? null;
  const sources = response.sources.map(buildSourceFreshnessView);
  const allSourcesAvailable = sources.every((source) => source.status === "AVAILABLE");

  return {
    generatedAt: response.generatedAt,
    generatedAtLabel: formatTime(response.generatedAt),
    items,
    selectedCase,
    selectedCaseId: selectedCase?.id ?? null,
    selectionFellBack: requestedCaseId !== null && requestedCaseId !== selectedCase?.id,
    sources,
    mobileSummary: buildMobileSummary(response),
    allSourcesAvailable,
    sourceStatusLabel: allSourcesAvailable ? "전체 신호 정상" : "일부 신호 확인 불가",
    nextCursor: response.nextCursor,
  };
}

function buildCaseView(item: AdminOperationCase, now: Date): AdminOperationCaseView {
  return {
    ...item,
    summary: adminOperationSummaryLabel(item.summaryCode),
    severityLabel: SEVERITY_LABELS[item.severity] ?? "상태 확인",
    stateLabel: STATE_LABELS[item.state] ?? "상태 확인",
    sourceLabel: SOURCE_LABELS[item.sourceType] ?? "운영 신호",
    impactLabel: `영향 ${item.impactCount}건`,
    ageLabel: formatAge(item.firstObservedAt, now),
  };
}

function buildSourceFreshnessView(
  source: AdminOperationSourceFreshness,
): AdminOperationSourceFreshnessView {
  const statusLabel = SOURCE_STATUS_LABELS[source.status] ?? "상태 확인 필요";
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
