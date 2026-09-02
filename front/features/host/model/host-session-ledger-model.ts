import type { SessionState } from "@/shared/model/readmates-types";
import type { PublicSiteVisibility, SessionAccessScope } from "./session-exposure-model";

export type HostSessionLedgerRecordStatus = "NOT_STARTED" | "INCOMPLETE" | "COMPLETE";

export type HostSessionLedgerView = "active" | "trash";

export type HostSessionLedgerFilters = {
  view: HostSessionLedgerView;
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
  accessScope?: SessionAccessScope;
  siteVisibility?: PublicSiteVisibility;
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

export type HostSessionLedgerRowFacts = {
  attendanceLabel?: string;
  reflectionLabel?: string;
  draftLabel?: string;
  feedbackLabel?: string;
  publicationLabel?: string;
  actionLabel?: string;
  dateLabel?: string;
};

export type HostSessionLedgerNextAction = {
  sessionId: string;
  label: string;
  meta: string;
  href?: string;
  ctaLabel?: string;
};

export type HostSessionLedgerWorkItem = {
  title: string;
  meta: string;
  href?: string;
};

export type HostSessionLedgerStatusCounts = {
  closing: number;
  drafting: number;
  published: number;
};

export type HostSessionAttentionData = {
  items: HostSessionLedgerItem[];
  summary: HostSessionLedgerSummary;
};

export function attentionItems(page: Pick<HostSessionAttentionData, "items">): HostSessionLedgerItem[] {
  return page.items;
}

export function dedupeHostSessionLedgerItems(
  items: readonly HostSessionLedgerItem[],
): HostSessionLedgerItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.sessionId)) {
      return false;
    }
    seen.add(item.sessionId);
    return true;
  });
}

const RECORD_STATUSES = new Set<HostSessionLedgerRecordStatus>(["NOT_STARTED", "INCOMPLETE", "COMPLETE"]);

export function normalizeHostSessionLedgerFilters(params: URLSearchParams): HostSessionLedgerFilters {
  const recordStatus = params.get("recordStatus");
  const needsAttention = params.get("needsAttention");
  const view = params.get("view") === "trash" ? "trash" : "active";

  return {
    view,
    search: view === "trash" ? "" : params.get("search")?.trim().replace(/\s+/g, " ") ?? "",
    state: null,
    recordStatus: view === "trash"
      ? null
      : RECORD_STATUSES.has(recordStatus as HostSessionLedgerRecordStatus)
        ? recordStatus as HostSessionLedgerRecordStatus
        : null,
    needsAttention: view === "trash"
      ? null
      : needsAttention === "true" ? true : needsAttention === "false" ? false : null,
  };
}

export function toHostSessionLedgerSearch(filters: HostSessionLedgerFilters) {
  if (filters.view === "trash") {
    return "?view=trash";
  }
  const params = new URLSearchParams();
  const search = filters.search.trim().replace(/\s+/g, " ");
  if (search) {
    params.set("search", search);
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function hostSessionTrashRemainingCopy(purgeAfter: string, now = new Date()): string {
  const purge = Date.parse(purgeAfter);
  if (Number.isNaN(purge)) {
    return "남은 복원 기간을 확인할 수 없습니다.";
  }
  const remainingMs = purge - now.getTime();
  if (remainingMs <= 0) {
    return "남은 복원 기간이 없습니다.";
  }
  const days = Math.ceil(remainingMs / MS_PER_DAY);
  if (days <= 1) {
    return "오늘까지 복원할 수 있습니다.";
  }
  return `남은 복원 기간 ${days}일`;
}

export function hostSessionTrashDeletedAtLabel(deletedAt: string) {
  const date = new Date(deletedAt);
  if (Number.isNaN(date.getTime())) {
    return "삭제 시각을 확인할 수 없습니다.";
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
    ? `삭제 ${year}.${month}.${day} ${hour}:${minute}`
    : "삭제 시각을 확인할 수 없습니다.";
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
  item: Pick<HostSessionLedgerItem, "hasDraft" | "recordStatus"> &
    Partial<Pick<HostSessionLedgerItem, "needsAttention">>,
) {
  if (item.recordStatus === "NOT_STARTED") {
    return "마감 시작";
  }
  if (item.hasDraft || item.needsAttention || item.recordStatus === "INCOMPLETE") {
    return "마감실 열기";
  }
  return "기록 보기";
}

export function hostSessionLedgerDraftLabel(
  item: Pick<HostSessionLedgerItem, "hasDraft" | "recordStatus">,
) {
  if (item.hasDraft) return "작성 중";
  if (item.recordStatus === "COMPLETE") return "완료";
  return "초안 없음";
}

export function hostSessionLedgerPublicationLabel(
  item: Pick<HostSessionLedgerItem, "recordStatus"> &
    Partial<Pick<HostSessionLedgerItem, "state">>,
) {
  if (item.state === "PUBLISHED") return "게시됨";
  if (item.recordStatus === "NOT_STARTED") return "마감 필요";
  if (item.recordStatus === "COMPLETE") return "게시 준비";
  return "대기";
}

export function hostSessionLedgerFeedbackLabel(
  item: Pick<HostSessionLedgerItem, "recordStatus" | "needsAttention">,
) {
  if (item.needsAttention) return "확인 필요";
  if (item.recordStatus === "COMPLETE") return "등록됨";
  if (item.recordStatus === "NOT_STARTED") return "미등록";
  return "없음";
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
