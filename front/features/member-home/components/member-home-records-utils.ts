import type { MyPageResponse } from "@/shared/api/readmates";

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
