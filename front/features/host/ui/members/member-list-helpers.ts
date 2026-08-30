import type { HostMemberListItem, MembershipStatus } from "@/features/host/model/host-view-types";
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

  const weeks = Math.floor(days / 7);
  if (weeks < 8) {
    return `${weeks}주`;
  }

  const months = Math.floor(days / 30);
  if (months < 24) {
    return `${Math.max(months, 1)}개월`;
  }

  return `${Math.floor(months / 12)}년`;
}
