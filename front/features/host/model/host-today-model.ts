import type { HostNotificationSummary } from "@/features/host/api/host-contracts";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import { hostMeetingLifecycleLabel } from "@/shared/model/meeting-language";
import {
  type MeetingListItem,
  resolveActiveMeeting,
} from "./host-meeting-ledger-model";
import type {
  HostSessionLedgerItem,
  HostSessionLedgerSummary,
} from "./host-session-ledger-model";

export type HostTodayQueueItem = {
  id: string;
  kind: "record" | "notification" | "readiness";
  title: string;
  detail: string;
  agedLabel: string;
  resolveHref: string;
  resolveLabel: string;
};

export type HostTodayView = {
  headline: string;
  nextMeeting: {
    sessionId: string;
    statusLabel: string;
    isMeetingDay: boolean;
    detailHref: string;
  } | null;
  queue: {
    items: HostTodayQueueItem[];
    totalCount: number;
    emptyCheckedAtLabel: string | null;
    allHref: string;
  };
  upcoming: Array<{ sessionId: string; ordinalLabel: string; date: string; href: string }>;
};

export const HOST_TODAY_QUEUE_CAP = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildHostTodayView(input: {
  today: string;
  now: string;
  basePath: string;
  meetings: readonly MeetingListItem[];
  attention: { items: HostSessionLedgerItem[]; summary: HostSessionLedgerSummary } | null;
  operations: HostClubOperationsSnapshot | null;
  notifications: HostNotificationSummary | null;
}): HostTodayView {
  const basePath = normalizeBasePath(input.basePath);
  const composed = composeQueueItems({
    today: input.today,
    basePath,
    attention: input.attention,
    notifications: input.notifications,
    operations: input.operations,
  });
  const totalCount = composed.length;
  const items = composed;

  const nextMeeting = buildNextMeeting(input.meetings, input.today, basePath);
  const daysUntil = nextMeeting
    ? calendarDaysBetween(input.today, findMeetingDate(input.meetings, nextMeeting.sessionId) ?? input.today)
    : null;

  return {
    headline: buildHeadline(daysUntil, totalCount),
    nextMeeting,
    queue: {
      items,
      totalCount,
      emptyCheckedAtLabel: totalCount === 0 ? input.now : null,
      allHref: hostPath(basePath, "/sessions"),
    },
    upcoming: buildUpcoming(input.meetings, input.today, basePath, nextMeeting?.sessionId ?? null),
  };
}

function composeQueueItems(input: {
  today: string;
  basePath: string;
  attention: { items: HostSessionLedgerItem[]; summary: HostSessionLedgerSummary } | null;
  notifications: HostNotificationSummary | null;
  operations: HostClubOperationsSnapshot | null;
}): HostTodayQueueItem[] {
  const items: HostTodayQueueItem[] = [];

  for (const item of input.attention?.items ?? []) {
    items.push(recordQueueItem(item, input.today, input.basePath));
  }

  const failed = input.notifications?.failed ?? 0;
  const dead = input.notifications?.dead ?? 0;
  if (failed + dead > 0) {
    items.push(notificationQueueItem(failed, dead, input.basePath));
  }

  const readiness = input.operations?.readiness;
  if (readiness) {
    for (const [index, reason] of readiness.blockingReasons.entries()) {
      items.push(readinessQueueItem(reason, index, readiness.nextAction, input.basePath));
    }
  }

  return items;
}

function recordQueueItem(
  item: HostSessionLedgerItem,
  today: string,
  basePath: string,
): HostTodayQueueItem {
  const ageSource = dateOnlyFromTimestamp(item.lastModifiedAt) ?? item.date;
  const agedDays = Math.max(0, calendarDaysBetween(ageSource, today));
  return {
    id: `record:${item.sessionId}`,
    kind: "record",
    title: item.bookTitle || item.title,
    detail: recordDetail(item),
    agedLabel: `${agedDays}일 경과`,
    resolveHref: hostPath(basePath, `/sessions/${encodeURIComponent(item.sessionId)}?section=records`),
    resolveLabel: "기록 마저 쓰기",
  };
}

function recordDetail(item: HostSessionLedgerItem): string {
  if (item.hasDraft) {
    return "초안이 남아 있습니다";
  }
  if (item.recordStatus === "INCOMPLETE") {
    return "기록이 미완료입니다";
  }
  if (item.recordStatus === "NOT_STARTED") {
    return "기록이 시작 전입니다";
  }
  return "확인이 필요합니다";
}

function notificationQueueItem(failed: number, dead: number, basePath: string): HostTodayQueueItem {
  const parts = [
    failed > 0 ? `실패 ${failed}건` : null,
    dead > 0 ? `중단 ${dead}건` : null,
  ].filter(Boolean);
  return {
    id: "notification:failures",
    kind: "notification",
    title: "알림 발송",
    detail: parts.join(" · ") || "실패 확인이 필요합니다",
    agedLabel: "확인 필요",
    resolveHref: hostPath(basePath, "/notifications"),
    resolveLabel: "재시도 확인",
  };
}

function readinessQueueItem(
  reason: string,
  index: number,
  nextAction: string | null,
  basePath: string,
): HostTodayQueueItem {
  return {
    id: `readiness:${index}:${reason}`,
    kind: "readiness",
    title: "클럽 준비",
    detail: reason,
    agedLabel: "확인 필요",
    resolveHref: readinessResolveHref(basePath, nextAction),
    resolveLabel: "확인하기",
  };
}

function readinessResolveHref(basePath: string, nextAction: string | null): string {
  if (!nextAction) {
    return hostPath(basePath, "/sessions");
  }
  if (nextAction.startsWith("/app/host")) {
    return hostPath(basePath, nextAction.slice("/app/host".length) || "/");
  }
  if (nextAction.startsWith("/")) {
    return nextAction;
  }
  switch (nextAction) {
    case "CREATE_SESSION":
    case "OPEN_SESSION":
      return hostPath(basePath, "/sessions/new");
    case "NOTIFICATIONS":
      return hostPath(basePath, "/notifications");
    default:
      return hostPath(basePath, "/sessions");
  }
}

function buildNextMeeting(
  meetings: readonly MeetingListItem[],
  today: string,
  basePath: string,
): HostTodayView["nextMeeting"] {
  const active = resolveActiveMeeting(meetings);
  if (!active) {
    return null;
  }
  const meeting = meetings.find((item) => item.sessionId === active.sessionId);
  if (!meeting) {
    return null;
  }
  return {
    sessionId: meeting.sessionId,
    statusLabel: hostMeetingLifecycleLabel(meeting.state),
    isMeetingDay: meeting.date === today,
    detailHref: hostPath(basePath, `/sessions/${encodeURIComponent(meeting.sessionId)}`),
  };
}

function buildUpcoming(
  meetings: readonly MeetingListItem[],
  today: string,
  basePath: string,
  activeSessionId: string | null,
): HostTodayView["upcoming"] {
  // MeetingListItem has no sessionNumber — ordinalLabel stays empty rather than inventing one.
  return meetings
    .filter((item) => (item.state === "DRAFT" || item.state === "OPEN") && item.date >= today)
    .filter((item) => item.sessionId !== activeSessionId)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item) => ({
      sessionId: item.sessionId,
      ordinalLabel: "",
      date: item.date,
      href: hostPath(basePath, `/sessions/${encodeURIComponent(item.sessionId)}`),
    }));
}

function buildHeadline(daysUntil: number | null, queueCount: number): string {
  const queuePart = `처리할 일 ${queueCount}건`;
  if (daysUntil === null) {
    return `다음 모임 없음 · ${queuePart}`;
  }
  if (daysUntil < 0) {
    return `모임일이 지났습니다 · ${queuePart}`;
  }
  return `다음 모임까지 ${daysUntil}일 · ${queuePart}`;
}

function findMeetingDate(meetings: readonly MeetingListItem[], sessionId: string): string | null {
  return meetings.find((item) => item.sessionId === sessionId)?.date ?? null;
}

function calendarDaysBetween(fromDate: string, toDate: string): number {
  const from = parseDateOnly(fromDate);
  const to = parseDateOnly(toDate);
  if (!from || !to) {
    return 0;
  }
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function dateOnlyFromTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeBasePath(basePath: string): string {
  return basePath.replace(/\/+$/, "") || "/";
}

function hostPath(basePath: string, suffix: string): string {
  const path = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${basePath}${path}`;
}
