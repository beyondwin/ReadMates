import {
  fetchMemberHomeCurrentSession,
  fetchMemberHomeMyPage,
  fetchMemberHomeNoteFeed,
} from "@/features/member-home/api/member-home-api";
import type {
  MemberHomeCurrentSessionResponse,
  MemberHomeMyPageResponse,
  MemberHomeNoteFeedItem,
} from "@/features/member-home/api/member-home-contracts";

export type MemberHomeRouteData = {
  current: MemberHomeCurrentSessionResponse;
  noteFeedItems: MemberHomeNoteFeedItem[];
  myPage: MemberHomeMyPageResponse;
};

export async function memberHomeLoader(): Promise<MemberHomeRouteData> {
  const [current, noteFeedItems, myPage] = await Promise.all([
    fetchMemberHomeCurrentSession(),
    fetchMemberHomeNoteFeed(),
    fetchMemberHomeMyPage(),
  ]);

  return { current, noteFeedItems, myPage };
}
