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

export type HostSessionLedgerItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string;
  state: SessionState;
  visibility: "HOST_ONLY" | "MEMBER" | "PUBLIC";
  recordStatus: HostSessionLedgerRecordStatus;
  needsAttention: boolean;
  hasDraft: boolean;
  liveRevision: number;
  draftRevision: number | null;
  lastModifiedAt: string | null;
};

export type HostSessionLedgerSummary = {
  needsAttentionCount: number;
  incompletePublishedCount: number;
  draftCount: number;
};

export type HostSessionAttentionData = {
  items: HostSessionLedgerItem[];
  summary: HostSessionLedgerSummary;
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

export function hostSessionLedgerActionLabel(
  item: Pick<HostSessionLedgerItem, "hasDraft" | "recordStatus">,
) {
  if (item.hasDraft) {
    return "초안 열기";
  }
  return item.recordStatus === "COMPLETE" ? "보기·수정" : "이어서 수정";
}

export function hostSessionLedgerModifiedAtLabel(value: string | null) {
  if (!value) {
    return "수정 기록 없음";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "수정 기록 없음";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const [year, month, day, hour, minute] = [
    part("year"),
    part("month"),
    part("day"),
    part("hour"),
    part("minute"),
  ];
  return year && month && day && hour && minute
    ? `마지막 수정 ${year}.${month}.${day} ${hour}:${minute}`
    : "수정 기록 없음";
}
