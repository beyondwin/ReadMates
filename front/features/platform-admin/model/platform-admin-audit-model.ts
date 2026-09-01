import {
  adminAuditActorRoleLanguage,
  adminAuditOutcomeLanguage,
} from "@/features/platform-admin/model/admin-status-language";
import {
  EMPTY_AI_OPS_FILTER,
  aiOpsPathFromFilter,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";

export type AdminAuditRange = "24h" | "7d" | "30d" | "90d";
export type AdminAuditSourceSlice = "S3" | "S4" | "S5" | "S6" | "PLATFORM" | "CLUB";
export type AdminAuditActionCategory =
  | "NOTIFICATION"
  | "SUPPORT"
  | "CLUB_LIFECYCLE"
  | "AI_OPS"
  | "AUTH_SECURITY"
  | "PLATFORM_ADMIN";
export type AdminAuditActorRole = "OWNER" | "OPERATOR" | "SUPPORT" | "HOST" | "MEMBER" | "SYSTEM" | "UNKNOWN";
export type AdminAuditOutcome = "SUCCESS" | "FAILED" | "DENIED" | "PREPARED" | "UNKNOWN";
export type AdminAuditMetadataState = "AVAILABLE" | "EMPTY" | "UNAVAILABLE";

export type AdminAuditFilters = {
  range?: AdminAuditRange;
  from?: string | null;
  to?: string | null;
  clubId?: string | null;
  actorRole?: AdminAuditActorRole | null;
  sourceSlice?: AdminAuditSourceSlice | null;
  actionCategory?: AdminAuditActionCategory | null;
  outcome?: AdminAuditOutcome | null;
};

export type AdminAuditLedgerPage = {
  generatedAt: string;
  filters: Record<string, unknown>;
  summary: {
    visibleCount: number;
    sourceUnavailableCount: number;
    metadataUnavailableCount: number;
    unavailableSources: string[];
  };
  items: AdminAuditLedgerItem[];
  nextCursor: string | null;
};

export type AdminAuditLedgerItem = {
  id: string;
  occurredAt: string;
  sourceSlice: AdminAuditSourceSlice;
  sourceTable: string;
  actionCategory: AdminAuditActionCategory;
  actionType: string;
  outcome: AdminAuditOutcome;
  actor: {
    userId: string | null;
    role: AdminAuditActorRole;
    displayLabel: string;
  };
  target: {
    clubId: string | null;
    userId: string | null;
    jobId: string | null;
    eventId: string | null;
    label: string;
  };
  summary: string;
  safeMetadata: Array<{ label: string; value: string; kind: string }>;
  metadataState: AdminAuditMetadataState;
};

export type AdminAuditLedgerRow = {
  occurredAt: string;
  actor: string;
  action: string;
  result: string;
};

const RANGES: AdminAuditRange[] = ["24h", "7d", "30d", "90d"];
const SOURCE_SLICES: AdminAuditSourceSlice[] = ["S3", "S4", "S5", "S6", "PLATFORM", "CLUB"];
const ACTOR_ROLES: AdminAuditActorRole[] = ["OWNER", "OPERATOR", "SUPPORT", "HOST", "MEMBER", "SYSTEM", "UNKNOWN"];
const ACTION_CATEGORIES: AdminAuditActionCategory[] = [
  "NOTIFICATION",
  "SUPPORT",
  "CLUB_LIFECYCLE",
  "AI_OPS",
  "AUTH_SECURITY",
  "PLATFORM_ADMIN",
];
const OUTCOMES: AdminAuditOutcome[] = ["SUCCESS", "FAILED", "DENIED", "PREPARED", "UNKNOWN"];

export function adminAuditFiltersFromSearchParams(params: URLSearchParams): AdminAuditFilters {
  const filters: AdminAuditFilters = {
    range: enumParam(params.get("range"), RANGES) ?? "7d",
  };
  setFilter(filters, "from", normalizedInstant(params.get("from")));
  setFilter(filters, "to", normalizedInstant(params.get("to")));
  setFilter(
    filters,
    "clubId",
    normalizedIdentifier(params.get("clubId")) ?? normalizedIdentifier(params.get("target")),
  );
  setFilter(filters, "actorRole", enumParam(params.get("actorRole"), ACTOR_ROLES));
  setFilter(filters, "sourceSlice", enumParam(params.get("sourceSlice"), SOURCE_SLICES));
  setFilter(filters, "actionCategory", enumParam(params.get("actionCategory"), ACTION_CATEGORIES));
  setFilter(filters, "outcome", enumParam(params.get("outcome"), OUTCOMES));
  return filters;
}

export function adminAuditSearchFromFilters(filters: AdminAuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  setParam(params, "range", filters.range);
  setParam(params, "from", filters.from);
  setParam(params, "to", filters.to);
  setParam(params, "clubId", filters.clubId);
  setParam(params, "actorRole", filters.actorRole);
  setParam(params, "sourceSlice", filters.sourceSlice);
  setParam(params, "actionCategory", filters.actionCategory);
  setParam(params, "outcome", filters.outcome);
  return params;
}

export function mergeAdminAuditLedgerPages(pages: AdminAuditLedgerPage[]): AdminAuditLedgerPage | null {
  const first = pages[0];
  const last = pages.at(-1);
  if (!first || !last) return null;

  const seen = new Set<string>();
  const items = pages.flatMap((page) => page.items).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const unavailableSources = [...new Set(pages.flatMap((page) => page.summary.unavailableSources))];

  return {
    generatedAt: first.generatedAt,
    filters: first.filters,
    summary: {
      visibleCount: items.length,
      sourceUnavailableCount: unavailableSources.length,
      metadataUnavailableCount: items.filter((item) => item.metadataState === "UNAVAILABLE").length,
      unavailableSources,
    },
    items,
    nextCursor: last.nextCursor,
  };
}

export function adminAuditShareSafeIdentifier(value: string | null): string | null {
  return normalizedIdentifier(value);
}

export function adminAuditReasonLabel(item: AdminAuditLedgerItem): string {
  const reasonRedacted = item.safeMetadata.some(
    (meta) => meta.label.toLowerCase() === "reasonredacted" && meta.value.toLowerCase() === "true",
  );
  if (reasonRedacted) return "사유 내용은 보호되어 표시되지 않습니다.";

  const entry = item.safeMetadata.find((meta) => {
    const label = meta.label.toLowerCase();
    return label === "reason" || label === "reasontext" || label === "note";
  });
  const value = entry?.value.trim() ?? "";
  if (value) return `기록된 사유: ${value}`;

  const reasonPresent = item.safeMetadata.find((meta) => meta.label.toLowerCase() === "reasonpresent");
  if (reasonPresent?.value.toLowerCase() === "true") return "사유가 기록되어 있습니다.";

  const reasonCategory = item.safeMetadata.find((meta) => meta.label.toLowerCase() === "reasoncategory");
  if (reasonCategory?.value.trim()) return "사유 분류가 기록되어 있습니다.";

  return "기록된 사유 정보가 없습니다.";
}

export function formatAdminAuditOccurredAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatAdminAuditLedgerSentenceBody(item: AdminAuditLedgerItem): string {
  const row = buildAdminAuditLedgerRow(item);
  return `${row.actor} · ${row.action} · ${row.result}`;
}

export function formatAdminAuditLedgerSentence(item: AdminAuditLedgerItem): string {
  const row = buildAdminAuditLedgerRow(item);
  return `${row.occurredAt} · ${row.actor} · ${row.action} · ${row.result}`;
}

export function buildAdminAuditLedgerRow(item: AdminAuditLedgerItem): AdminAuditLedgerRow {
  const target = adminAuditTargetPrimaryLabel(item);
  const action = adminAuditActionPrimaryLabel(item);
  return {
    occurredAt: formatAdminAuditOccurredAt(item.occurredAt),
    actor: adminAuditActorPrimaryLabel(item.actor),
    action: action ? `${target}에 ${action}` : `${target}의 처리 내용을 확인해야 합니다.`,
    result: isPendingConvergenceAuditItem(item) ? "진행 중" : labelAdminAuditOutcome(item.outcome),
  };
}

export function adminAuditTargetPrimaryLabel(item: AdminAuditLedgerItem): string {
  if (item.actionType.startsWith("SUPPORT_ACCESS_GRANT_")) return "지원 접근 대상";
  if (item.actionType.startsWith("ADMIN_NOTIFICATION_REPLAY_")) return "알림 재처리 대상";
  if (item.actionType === "EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED"
    || item.actionType === "PUBLIC_TAKEDOWN_CONVERGENCE") return "공개 기록";
  if (item.actionType.startsWith("OPERATION_CASE_")) return "운영 케이스";
  if (item.actionType.startsWith("CLUB_") || item.actionType === "ADMIN_CLUB_METADATA_UPDATED") return "대상 클럽";
  if (item.actionType.startsWith("AI_") || item.actionCategory === "AI_OPS") return "AI 작업";

  const label = item.target.label.trim();
  if (label === "AI job") return "AI 작업";
  if (label === "Replay preview") return "알림 재처리 대상";
  if (label && label !== "대상 없음" && !isAuditIdentifierLabel(item, label)) return label;
  if (item.target.jobId) return "AI 작업";
  if (item.target.userId) return "대상 사용자";
  if (item.target.clubId) return "대상 클럽";
  if (item.target.eventId) return "대상 이벤트";
  if (item.actionCategory === "PLATFORM_ADMIN") return "플랫폼 운영 대상";
  if (item.actionCategory === "AUTH_SECURITY") return "인증·보안 대상";
  if (item.actionCategory === "NOTIFICATION") return "알림 처리 대상";
  if (item.actionCategory === "SUPPORT") return "지원 접근 대상";
  if (item.actionCategory === "CLUB_LIFECYCLE") return "대상 클럽";
  return "대상";
}

export function adminAuditActionPrimaryLabel(item: AdminAuditLedgerItem): string | null {
  const exact = ADMIN_AUDIT_ACTION_LABELS[item.actionType];
  if (exact) return exact;
  if (item.actionType.startsWith("OPERATION_CASE_")) return "운영 케이스 상태를 기록했습니다.";
  if (item.actionType.startsWith("CLUB_COMMAND_")) return "클럽 운영 명령을 기록했습니다.";
  if (item.actionType.startsWith("CLUB_CONVERGENCE_")) return "클럽 운영 반영 상태를 기록했습니다.";
  if (item.actionType.startsWith("AI_COMMAND_")) return "AI 작업 명령을 기록했습니다.";
  if (item.actionType.startsWith("SERVICE_CONVERGENCE_")) {
    if (item.actionCategory === "NOTIFICATION") return "알림 처리 반영 상태를 기록했습니다.";
    if (item.actionCategory === "AI_OPS") return "AI 작업 반영 상태를 기록했습니다.";
  }
  return null;
}

export function isAdminAuditTechnicalMetadata(entry: { label: string; kind: string }): boolean {
  const label = entry.label.toLowerCase();
  const kind = entry.kind.toLowerCase();
  return kind === "id" || kind === "reference" || kind === "fingerprint" || kind === "code" || kind === "boolean"
    || label.endsWith("id") || label.includes("hash");
}

export function labelAdminAuditOutcome(outcome: AdminAuditOutcome): string {
  return adminAuditOutcomeLanguage(outcome).primaryText;
}

export function labelAdminAuditSourceSlice(sourceSlice: AdminAuditSourceSlice): string {
  return {
    S3: "클럽 운영",
    S4: "지원 접근",
    S5: "알림",
    S6: "AI 작업",
    PLATFORM: "플랫폼",
    CLUB: "클럽",
  }[sourceSlice];
}

export function labelAdminAuditActionCategory(category: AdminAuditActionCategory): string {
  return {
    NOTIFICATION: "알림",
    SUPPORT: "지원 접근",
    CLUB_LIFECYCLE: "클럽 운영",
    AI_OPS: "AI 작업",
    AUTH_SECURITY: "인증·보안",
    PLATFORM_ADMIN: "플랫폼 운영",
  }[category];
}

export function labelAdminAuditActorRole(role: AdminAuditActorRole): string {
  return adminAuditActorRoleLanguage(role).primaryText;
}

export function adminAuditActorPrimaryLabel(actor: {
  role: string;
  displayLabel: string;
}): string {
  const roleLabel = adminAuditActorRoleLanguage(actor.role).primaryText;
  const displayLabel = actor.displayLabel.trim();
  if (!displayLabel || displayLabel === actor.role) {
    return roleLabel;
  }
  return `${displayLabel} · ${roleLabel}`;
}

export function shouldShowAdminAuditDetailValue(label: string, value: string): boolean {
  const normalizedLabel = label.toLowerCase();
  const normalizedValue = value.toLowerCase();
  if (normalizedLabel.includes("raw")) return false;
  if (normalizedLabel.includes("json")) return false;
  if (value.includes("{") || value.includes("}")) return false;
  if (normalizedValue.includes("token=") || normalizedValue.includes("secret")) return false;
  return true;
}

export function aiOpsDrilldownForAuditItem(item: AdminAuditLedgerItem): string | null {
  if (item.actionCategory !== "AI_OPS") return null;
  const clubId = item.target.clubId;
  if (!clubId) return null;
  return aiOpsPathFromFilter({ ...EMPTY_AI_OPS_FILTER, clubId, jobId: item.target.jobId });
}

export type AdminAuditOperationState = "NEEDS_REVIEW" | "RECORDED" | "FOLLOW_UP_AVAILABLE" | "LIMITED_DETAIL";

export type AdminAuditOperationSummary = {
  state: AdminAuditOperationState;
  label: string;
  detail: string;
  nextHref: string | null;
  nextLabel: string | null;
};

export function buildAdminAuditOperationSummary(item: AdminAuditLedgerItem): AdminAuditOperationSummary {
  const nextHref = aiOpsDrilldownForAuditItem(item);
  const nextLabel = nextHref ? "AI 작업에서 보기" : null;

  if (item.metadataState === "UNAVAILABLE") {
    return {
      state: "LIMITED_DETAIL",
      label: "세부 정보 제한",
      detail: "안전 정책 또는 source 상태 때문에 세부 정보를 표시하지 않습니다.",
      nextHref,
      nextLabel,
    };
  }

  if (item.outcome === "FAILED" || item.outcome === "DENIED" || item.outcome === "UNKNOWN") {
    return {
      state: "NEEDS_REVIEW",
      label: "확인 필요",
      detail: `${labelAdminAuditSourceSlice(item.sourceSlice)} 이벤트 결과가 ${labelAdminAuditOutcome(item.outcome)} 상태입니다.`,
      nextHref,
      nextLabel,
    };
  }

  if (nextHref) {
    return {
      state: "FOLLOW_UP_AVAILABLE",
      label: "후속 화면 있음",
      detail: "AI 작업 화면에서 같은 클럽 범위로 이어서 확인할 수 있습니다.",
      nextHref,
      nextLabel,
    };
  }

  const visibleMetadataCount = item.safeMetadata.filter((entry) =>
    shouldShowAdminAuditDetailValue(entry.label, entry.value),
  ).length;

  return {
    state: "RECORDED",
    label: "기록 보존",
    detail:
      visibleMetadataCount > 0
        ? `${labelAdminAuditSourceSlice(item.sourceSlice)} 이벤트가 감사 가능한 안전한 메타데이터와 함께 기록되었습니다.`
        : `${labelAdminAuditSourceSlice(item.sourceSlice)} 이벤트가 감사 ledger에 기록되었습니다.`,
    nextHref: null,
    nextLabel: null,
  };
}

function isPendingConvergenceAuditItem(item: AdminAuditLedgerItem): boolean {
  if (!CONVERGENCE_SOURCE_TABLES.has(item.sourceTable)) return false;
  return item.safeMetadata.some((entry) => {
    const label = entry.label.toLowerCase();
    return (label === "state" || label === "outcome") && entry.value === "PENDING";
  });
}

function isAuditIdentifierLabel(item: AdminAuditLedgerItem, label: string): boolean {
  return [item.id, item.target.clubId, item.target.userId, item.target.jobId, item.target.eventId]
    .some((identifier) => identifier != null && identifier === label);
}

const CONVERGENCE_SOURCE_TABLES = new Set([
  "platform_admin_club_command_convergence_events",
  "admin_service_command_convergence_events:notification",
  "admin_service_command_convergence_events:ai",
  "public_convergence_events",
]);

const ADMIN_AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  SUPPORT_ACCESS_GRANT_CREATE: "지원 접근 권한을 부여했습니다.",
  SUPPORT_ACCESS_GRANT_REVOKE: "지원 접근 권한을 회수했습니다.",
  SUPPORT_ACCESS_GRANT_CREATED: "지원 접근 권한을 부여했습니다.",
  SUPPORT_ACCESS_GRANT_REVOKED: "지원 접근 권한을 회수했습니다.",
  ADMIN_NOTIFICATION_REPLAY_CONFIRMED: "알림 재처리를 확정했습니다.",
  ADMIN_NOTIFICATION_REPLAY_PREVIEW_PREPARED: "재처리 대상을 미리 확인했습니다.",
  ADMIN_NOTIFICATION_REPLAY_PREVIEW_CONSUMED: "재처리 미리보기를 사용했습니다.",
  ADMIN_NOTIFICATION_REPLAY_PREVIEW_LEGACY: "이전 재처리 미리보기 증거를 기록했습니다.",
  EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED: "긴급 공개 회수의 원본 차단을 기록했습니다.",
  PUBLIC_TAKEDOWN_CONVERGENCE: "긴급 공개 회수의 반영 상태를 기록했습니다.",
  CLUB_ACTIVATED: "클럽을 활성화했습니다.",
  CLUB_SUSPENDED: "클럽을 일시 중지했습니다.",
  CLUB_RESTORED: "클럽을 복구했습니다.",
  CLUB_ARCHIVED: "클럽을 보관 처리했습니다.",
  ADMIN_CLUB_METADATA_UPDATED: "클럽 기본 정보를 수정했습니다.",
  AI_GENERATION_AUDIT: "AI 작업 감사 증거를 기록했습니다.",
  AI_COMMAND_RETRY_COMMIT: "AI 작업 반영을 다시 시도했습니다.",
  AI_COMMAND_FORCE_CANCEL: "AI 작업을 강제로 중단했습니다.",
  FEEDBACK_DOCUMENT_PUBLISHED: "피드백 문서 공개를 기록했습니다.",
};

function enumParam<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && allowed.includes(value as T) ? (value as T) : null;
}

function setFilter<K extends keyof AdminAuditFilters>(filters: AdminAuditFilters, key: K, value: AdminAuditFilters[K]) {
  if (value) {
    filters[key] = value;
  }
}

function setParam(params: URLSearchParams, key: string, value: string | null | undefined) {
  if (value) {
    params.set(key, value);
  }
}

function normalizedInstant(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizedIdentifier(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized && normalized.length <= 128 ? normalized : null;
}
