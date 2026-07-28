import {
  fetchMyJourney,
  fetchMyPage,
} from "@/features/archive/api/archive-api";
import type {
  MyJourneyPage,
  MyPageResponse,
} from "@/features/archive/api/archive-contracts";
import { emptyMyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import type { LoaderFunctionArgs } from "react-router-dom";

export type MyPageRouteData = {
  profile: MyPageResponse;
  journey: MyJourneyPage;
};

function inactiveMyPageData(auth: AuthMeResponse): MyPageResponse {
  return {
    displayName: auth.displayName ?? "",
    accountName: auth.accountName ?? "",
    email: auth.email ?? "",
    role: auth.role ?? "MEMBER",
    membershipStatus: auth.membershipStatus ?? "INACTIVE",
    clubName: null,
    joinedAt: "",
    sessionCount: 0,
    totalSessionCount: 0,
    completedReadingCount: 0,
    currentSessionId: null,
    recentAttendances: [],
  };
}

export async function myPageLoader(args?: LoaderFunctionArgs): Promise<MyPageRouteData> {
  const access = await loadArchiveMemberAuth(args);

  if (!access.allowed) {
    return {
      profile: inactiveMyPageData(access.auth),
      journey: emptyMyJourneyPage(),
    };
  }

  const context = { clubSlug: clubSlugFromLoaderArgs(args) };
  const [profile, journey] = await Promise.all([
    fetchMyPage(context),
    fetchMyJourney(context, { limit: 3 }),
  ]);

  return { profile, journey };
}
