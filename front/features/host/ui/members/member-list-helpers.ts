import type { HostMemberListItem, MembershipStatus } from "@/features/host/model/host-view-types";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

const statusLabels: Record<MembershipStatus, string> = {
  INVITED: "초대됨",
  VIEWER: "둘러보기 멤버",
  ACTIVE: "정식 멤버",
  SUSPENDED: "정지됨",
  LEFT: "탈퇴",
  INACTIVE: "비활성",
};

export function memberMeta(member: HostMemberListItem) {
  return `${member.email} · ${statusLabels[member.status]}`;
}

export function requestMeta(member: HostMemberListItem) {
  return `${member.email} · ${statusLabels[member.status]} · 요청일 ${formatDateOnlyLabel(member.createdAt)}`;
}

export function joinedMeta(member: HostMemberListItem) {
  const joined = member.joinedAt ? `참여 ${formatDateOnlyLabel(member.joinedAt)}` : `요청 ${formatDateOnlyLabel(member.createdAt)}`;
  return `${member.email} · ${statusLabels[member.status]} · ${joined}`;
}

export function inactiveMeta(member: HostMemberListItem) {
  const joined = member.joinedAt ? `참여 ${formatDateOnlyLabel(member.joinedAt)}` : `요청 ${formatDateOnlyLabel(member.createdAt)}`;
  return `${member.email} · ${joined}`;
}

export function preservedRecordBadge() {
  return { label: "기록 보존", className: "badge" };
}
