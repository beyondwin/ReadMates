import type { SessionState } from "@/shared/model/readmates-types";

export type HostSessionLedgerRecordStatus = "NOT_STARTED" | "INCOMPLETE" | "COMPLETE";

export type HostSessionLedgerFilters = {
  search: string;
  state: SessionState | null;
  recordStatus: HostSessionLedgerRecordStatus | null;
  needsAttention: boolean | null;
};

export type HostSessionLedgerBadge = {
  label: string;
  tone: "default" | "accent" | "warn" | "ok";
};

const SESSION_STATES = new Set<SessionState>(["DRAFT", "OPEN", "PUBLISHED", "CLOSED"]);
const RECORD_STATUSES = new Set<HostSessionLedgerRecordStatus>(["NOT_STARTED", "INCOMPLETE", "COMPLETE"]);

export function normalizeHostSessionLedgerFilters(params: URLSearchParams): HostSessionLedgerFilters {
  const state = params.get("state");
  const recordStatus = params.get("recordStatus");
  const needsAttention = params.get("needsAttention");

  return {
    search: params.get("search")?.trim().replace(/\s+/g, " ") ?? "",
    state: SESSION_STATES.has(state as SessionState) ? state as SessionState : null,
    recordStatus: RECORD_STATUSES.has(recordStatus as HostSessionLedgerRecordStatus)
      ? recordStatus as HostSessionLedgerRecordStatus
      : null,
    needsAttention: needsAttention === "true" ? true : needsAttention === "false" ? false : null,
  };
}

export function toHostSessionLedgerSearch(filters: HostSessionLedgerFilters) {
  const params = new URLSearchParams();
  const search = filters.search.trim().replace(/\s+/g, " ");
  if (search) {
    params.set("search", search);
  }
  if (filters.state) {
    params.set("state", filters.state);
  }
  if (filters.recordStatus) {
    params.set("recordStatus", filters.recordStatus);
  }
  if (filters.needsAttention !== null) {
    params.set("needsAttention", String(filters.needsAttention));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function hostSessionLedgerBadges(
  item: Pick<{ recordStatus: HostSessionLedgerRecordStatus; needsAttention: boolean; hasDraft: boolean },
    "recordStatus" | "needsAttention" | "hasDraft">,
): HostSessionLedgerBadge[] {
  const badges: HostSessionLedgerBadge[] = [];
  if (item.needsAttention) {
    badges.push({ label: "확인 필요", tone: "warn" });
  }
  if (item.hasDraft) {
    badges.push({ label: "초안 있음", tone: "accent" });
  }
  badges.push({
    label: item.recordStatus === "COMPLETE"
      ? "기록 완료"
      : item.recordStatus === "INCOMPLETE"
        ? "기록 미완료"
        : "기록 시작 전",
    tone: item.recordStatus === "COMPLETE" ? "ok" : "default",
  });
  return badges;
}
