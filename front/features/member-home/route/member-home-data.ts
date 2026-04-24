import {
  fetchMemberHomeCurrentSession,
  fetchMemberHomeNoteFeed,
  fetchMemberHomeUpcomingSessions,
} from "@/features/member-home/api/member-home-api";
import type {
  MemberHomeCurrentSessionResponse,
  MemberHomeNoteFeedItem,
  MemberHomeUpcomingSession,
} from "@/features/member-home/api/member-home-contracts";
import { loadMemberAppAuth } from "@/shared/auth/member-app-loader";

export type MemberHomeRouteData = {
  current: MemberHomeCurrentSessionResponse;
  noteFeedItems: MemberHomeNoteFeedItem[];
  upcomingSessions: MemberHomeUpcomingSession[];
};

export async function memberHomeLoader(): Promise<MemberHomeRouteData> {
  const access = await loadMemberAppAuth();

  if (!access.allowed) {
    return {
      current: { currentSession: null },
      noteFeedItems: [],
      upcomingSessions: [],
    };
  }

  const [current, noteFeedItems, upcomingSessions] = await Promise.all([
    fetchMemberHomeCurrentSession(),
    fetchMemberHomeNoteFeed(),
    fetchMemberHomeUpcomingSessions(),
  ]);

  return { current, noteFeedItems, upcomingSessions };
}
