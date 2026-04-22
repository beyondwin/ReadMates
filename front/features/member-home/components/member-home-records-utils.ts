import type { MemberHomeMyPageResponse as MyPageResponse } from "@/features/member-home/api/member-home-contracts";

export type AttendanceSummary = {
  attended: number;
  total: number;
};

export function attendanceSummaryFromMyPage(myPage?: MyPageResponse | null): AttendanceSummary | null {
  if (!myPage) {
    return null;
  }

  return {
    attended: myPage.sessionCount,
    total: Math.max(myPage.totalSessionCount, myPage.sessionCount),
  };
}
