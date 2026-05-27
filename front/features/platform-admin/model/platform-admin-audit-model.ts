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
  cursor?: string | null;
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
  setFilter(filters, "from", params.get("from"));
  setFilter(filters, "to", params.get("to"));
  setFilter(filters, "clubId", params.get("clubId"));
  setFilter(filters, "actorRole", enumParam(params.get("actorRole"), ACTOR_ROLES));
  setFilter(filters, "sourceSlice", enumParam(params.get("sourceSlice"), SOURCE_SLICES));
  setFilter(filters, "actionCategory", enumParam(params.get("actionCategory"), ACTION_CATEGORIES));
  setFilter(filters, "outcome", enumParam(params.get("outcome"), OUTCOMES));
  setFilter(filters, "cursor", params.get("cursor"));
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
  setParam(params, "cursor", filters.cursor);
  return params;
}

export function labelAdminAuditOutcome(outcome: AdminAuditOutcome): string {
  return {
    SUCCESS: "성공",
    FAILED: "실패",
    DENIED: "거부",
    PREPARED: "준비됨",
    UNKNOWN: "알 수 없음",
  }[outcome];
}

export function labelAdminAuditSourceSlice(sourceSlice: AdminAuditSourceSlice): string {
  return {
    S3: "클럽 운영",
    S4: "지원 접근",
    S5: "알림",
    S6: "AI 운영",
    PLATFORM: "플랫폼",
    CLUB: "클럽",
  }[sourceSlice];
}

export function labelAdminAuditActorRole(role: AdminAuditActorRole): string {
  return {
    OWNER: "OWNER",
    OPERATOR: "OPERATOR",
    SUPPORT: "SUPPORT",
    HOST: "HOST",
    MEMBER: "MEMBER",
    SYSTEM: "SYSTEM",
    UNKNOWN: "UNKNOWN",
  }[role];
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
