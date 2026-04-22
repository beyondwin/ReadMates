import {
  fetchMemberHomeCurrentSession,
  fetchMemberHomeMyPage,
  fetchMemberHomeNoteFeed,
} from "@/features/member-home/api/member-home-api";
import type {
  MemberHomeAuth,
  MemberHomeCurrentSessionResponse,
  MemberHomeMyPageResponse,
  MemberHomeNoteFeedItem,
} from "@/features/member-home/api/member-home-contracts";
import { loadMemberAppAuth } from "@/shared/auth/member-app-loader";

export type MemberHomeRouteData = {
  current: MemberHomeCurrentSessionResponse;
  noteFeedItems: MemberHomeNoteFeedItem[];
  myPage: MemberHomeMyPageResponse;
};

function inactiveMemberHomeMyPageData(auth: MemberHomeAuth): MemberHomeMyPageResponse {
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

export async function memberHomeLoader(): Promise<MemberHomeRouteData> {
  const access = await loadMemberAppAuth();

  if (!access.allowed) {
    return {
      current: { currentSession: null },
      noteFeedItems: [],
      myPage: inactiveMemberHomeMyPageData(access.auth),
    };
  }

  const [current, noteFeedItems, myPage] = await Promise.all([
    fetchMemberHomeCurrentSession(),
    fetchMemberHomeNoteFeed(),
    fetchMemberHomeMyPage(),
  ]);

  return { current, noteFeedItems, myPage };
}
