import type { HostMemberListItem } from "@/features/host/model/host-view-types";

export const memberActionPendingReason = "멤버 상태 업데이트를 처리하는 중입니다.";

export function disabledSuspendReason(member: HostMemberListItem, rowPending: boolean) {
  if (rowPending) {
    return memberActionPendingReason;
  }

  if (member.canSuspend) {
    return null;
  }

  if (member.role === "HOST") {
    return null;
  }

  if (member.status !== "ACTIVE") {
    return "정식 활성 멤버만 정지할 수 있습니다.";
  }

  return "이 멤버는 현재 정책상 정지할 수 없습니다.";
}

export function disabledDeactivateReason(member: HostMemberListItem, rowPending: boolean) {
  if (rowPending) {
    return memberActionPendingReason;
  }

  if (member.canDeactivate) {
    return null;
  }

  if (member.role === "HOST") {
    return null;
  }

  if (member.status === "LEFT" || member.status === "INACTIVE") {
    return "이미 탈퇴/비활성 처리된 멤버입니다.";
  }

  return "이 멤버는 현재 정책상 탈퇴 처리할 수 없습니다.";
}

export function disabledViewerActivationReason(rowPending: boolean) {
  return rowPending ? memberActionPendingReason : null;
}

export function disabledViewerDeactivateReason(member: HostMemberListItem, rowPending: boolean) {
  if (rowPending) {
    return memberActionPendingReason;
  }

  if (member.canDeactivate) {
    return null;
  }

  if (member.role === "HOST") {
    return "호스트는 둘러보기 해제할 수 없습니다.";
  }

  return "이 멤버는 현재 정책상 둘러보기 해제할 수 없습니다.";
}

export function disabledProfileReason(rowPending: boolean) {
  return rowPending ? memberActionPendingReason : null;
}

export function disabledRestoreReason(member: HostMemberListItem, rowPending: boolean) {
  if (rowPending) {
    return memberActionPendingReason;
  }

  if (member.canRestore) {
    return null;
  }

  if (member.status !== "SUSPENDED") {
    return "정지된 멤버만 복구할 수 있습니다.";
  }

  return "이 멤버는 현재 정책상 복구할 수 없습니다.";
}

export function actionKey(member: HostMemberListItem, action: string) {
  return `${member.membershipId}:${action}`;
}

export function isMembershipPending(membershipId: string, pendingActions: Set<string>) {
  for (const key of pendingActions) {
    if (key.startsWith(`${membershipId}:`)) {
      return true;
    }
  }

  return false;
}
