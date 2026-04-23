import {
  fetchMemberHomeCurrentSession,
  fetchMemberHomeNoteFeed,
} from "@/features/member-home/api/member-home-api";
import type {
  MemberHomeCurrentSessionResponse,
  MemberHomeNoteFeedItem,
} from "@/features/member-home/api/member-home-contracts";
import { loadMemberAppAuth } from "@/shared/auth/member-app-loader";

export type MemberHomeRouteData = {
  current: MemberHomeCurrentSessionResponse;
  noteFeedItems: MemberHomeNoteFeedItem[];
};

export async function memberHomeLoader(): Promise<MemberHomeRouteData> {
  const access = await loadMemberAppAuth();

  if (!access.allowed) {
    return {
      current: { currentSession: null },
      noteFeedItems: [],
    };
  }

  const [current, noteFeedItems] = await Promise.all([
    fetchMemberHomeCurrentSession(),
    fetchMemberHomeNoteFeed(),
  ]);

  return { current, noteFeedItems };
}
