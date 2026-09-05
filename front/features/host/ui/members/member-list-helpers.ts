import type { HostMemberListItem, MembershipStatus } from "@/features/host/model/host-view-types";
import type { ReadmatesIconName } from "@/shared/ui/icon";
import { formatDateOnlyLabel, formatDateTimeLabel } from "@/shared/ui/readmates-display";

const statusLabels: Record<MembershipStatus, string> = {
  INVITED: "초대됨",
  VIEWER: "둘러보기 멤버",
  ACTIVE: "정식 멤버",
  SUSPENDED: "정지됨",
  LEFT: "탈퇴",
  INACTIVE: "비활성",
};

export const rosterStatusLabels: Record<MembershipStatus, string> = {
  INVITED: "초대됨",
  VIEWER: "둘러보기",
  ACTIVE: "활동",
  SUSPENDED: "쉬는 중",
  LEFT: "탈퇴",
  INACTIVE: "비활성",
};

export function memberMeta(member: HostMemberListItem) {
  return `${member.email} · ${statusLabels[member.status]}`;
}

export function requestMeta(member: HostMemberListItem) {
  return `${statusLabels[member.status]} · 요청일 ${formatDateOnlyLabel(member.createdAt)}`;
}

export function joinedMeta(member: HostMemberListItem) {
  const joined = member.joinedAt ? `참여 ${formatDateOnlyLabel(member.joinedAt)}` : `요청 ${formatDateOnlyLabel(member.createdAt)}`;
  return `${member.email} · ${statusLabels[member.status]} · ${joined}`;
}

export function inactiveMeta(member: HostMemberListItem) {
  const joined = member.joinedAt ? `참여 ${formatDateOnlyLabel(member.joinedAt)}` : `요청 ${formatDateOnlyLabel(member.createdAt)}`;
  return `${member.email} · ${joined}`;
}

export function clubAccessMeta(member: HostMemberListItem) {
  const formatted = formatDateTimeLabel(member.lastClubAccessAt, "");
  return formatted ? `최근 접속 ${formatted}` : "접속 기록 없음";
}

const SEOUL_TIME_ZONE = "Asia/Seoul";

function seoulDayStamp(value: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000;
}

function seoulTimeLabel(value: Date): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const hour = part("hour");
  const minute = part("minute");
  return hour && minute ? `${hour}:${minute}` : "";
}

function relativeSeoulDayLabel(value: Date, now: Date): string | null {
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  const days = seoulDayStamp(now) - seoulDayStamp(value);
  if (days <= 0) {
    return "오늘";
  }
  if (days === 1) {
    return "어제";
  }
  return `${days}일 전`;
}

export function formatRecentClubAccess(value: string | null | undefined, now = new Date()): string {
  if (!value) {
    return "접속 기록 없음";
  }
  const observed = new Date(value);
  return relativeSeoulDayLabel(observed, now) ?? "접속 기록 없음";
}

export function formatPendingRequestTime(value: string | null | undefined, now = new Date()): string {
  if (!value) {
    return "";
  }
  const observed = new Date(value);
  const dayLabel = relativeSeoulDayLabel(observed, now);
  const timeLabel = Number.isNaN(observed.getTime()) ? "" : seoulTimeLabel(observed);
  if (!dayLabel || !timeLabel) {
    return "";
  }
  return `${dayLabel} ${timeLabel}`;
}

export function defaultScheduleSeenLabel(member: HostMemberListItem): string {
  if (
    member.status === "VIEWER"
    || member.status === "SUSPENDED"
    || member.status === "LEFT"
    || member.status === "INACTIVE"
    || member.status === "INVITED"
  ) {
    return "일정 대상 아님";
  }
  return "—";
}

export function scheduleSeenIconName(label: string): ReadmatesIconName {
  if (label === "미열람") {
    return "mail";
  }
  if (label === "일정 대상 아님" || label === "—") {
    return "minus-circle";
  }
  return "calendar";
}

export function rsvpIconName(label: string): ReadmatesIconName | null {
  if (label === "참석") {
    return "check-circle";
  }
  if (label === "미응답") {
    return "question-circle";
  }
  if (label === "불참") {
    return "x-circle";
  }
  return null;
}

export function statusPillTone(status: MembershipStatus): "info" | "neutral" | undefined {
  if (status === "VIEWER" || status === "INVITED") {
    return "info";
  }
  if (status === "ACTIVE") {
    return undefined;
  }
  return "neutral";
}

export function aggregateHostPeopleScheduleSeen(
  members: readonly HostMemberListItem[],
  factsByMembershipId?: Readonly<Record<string, { scheduleSeenLabel?: string }>>,
): { current: number; stale: number; unseen: number; notTarget: number } | null {
  if (!factsByMembershipId) {
    return null;
  }

  const counts = { current: 0, stale: 0, unseen: 0, notTarget: 0 };
  let known = false;
  for (const member of members) {
    const label = factsByMembershipId[member.membershipId]?.scheduleSeenLabel;
    if (!label) {
      continue;
    }
    known = true;
    if (label === "현재 일정 확인") {
      counts.current += 1;
    } else if (label === "변경 전 확인") {
      counts.stale += 1;
    } else if (label === "미열람") {
      counts.unseen += 1;
    } else if (label === "일정 대상 아님") {
      counts.notTarget += 1;
    }
  }
  return known ? counts : null;
}

export function preservedRecordBadge() {
  return { label: "기록 보존", className: "badge" };
}

export function formatMembershipTenure(joinedAt: string | null | undefined, now = new Date()): string {
  if (!joinedAt) {
    return "—";
  }

  const start = new Date(joinedAt);
  if (Number.isNaN(start.getTime())) {
    return "—";
  }

  const ms = now.getTime() - start.getTime();
  if (ms < 0) {
    return "—";
  }

  const days = Math.floor(ms / 86_400_000);
  if (days < 1) {
    return "오늘";
  }
  if (days < 14) {
    return `${days}일`;
  }

  const startParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(start);
  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  let years = part(nowParts, "year") - part(startParts, "year");
  let months = part(nowParts, "month") - part(startParts, "month");
  if (part(nowParts, "day") < part(startParts, "day")) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0) {
    if (months <= 0) {
      return `${Math.max(days, 1)}일`;
    }
    return `${months}개월`;
  }
  if (months === 0) {
    return `${years}년`;
  }
  return `${years}년 ${months}개월`;
}
