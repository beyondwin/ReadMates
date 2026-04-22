import { loadMyPageRouteData, type MyPageRouteData } from "@/features/archive/api/archive-api";
import type { MyPageResponse } from "@/features/archive/api/archive-contracts";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import type { AuthMeResponse } from "@/shared/api/readmates";

function inactiveMyPageData(auth: AuthMeResponse): MyPageResponse {
  return {
    displayName: auth.displayName ?? "",
    shortName: auth.shortName ?? "",
    email: auth.email ?? "",
    role: auth.role ?? "MEMBER",
    membershipStatus: auth.membershipStatus ?? "INACTIVE",
    clubName: null,
    joinedAt: "",
    sessionCount: 0,
    totalSessionCount: 0,
    recentAttendances: [],
  };
}

export async function myPageLoader(): Promise<MyPageRouteData> {
  const access = await loadArchiveMemberAuth();

  if (!access.allowed) {
    return { data: inactiveMyPageData(access.auth), reports: [], questionCount: 0, reviewCount: 0 };
  }

  return loadMyPageRouteData();
}
