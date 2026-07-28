import type { MembershipStatus } from "@/shared/auth/auth-contracts";

const membershipLabels: Record<MembershipStatus, string> = {
  ACTIVE: "정식 멤버",
  VIEWER: "둘러보기 멤버",
  SUSPENDED: "이용 정지",
  INVITED: "초대 대기",
  LEFT: "탈퇴",
  INACTIVE: "비활성",
};

export function accountMembershipLabel(status: MembershipStatus | null): string {
  return status ? membershipLabels[status] : "멤버";
}
