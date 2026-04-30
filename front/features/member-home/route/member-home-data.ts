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
import type { LoaderFunctionArgs } from "react-router-dom";
import { clubSlugFromLoaderArgs, loadMemberAppAuth } from "@/shared/auth/member-app-loader";

const MEMBER_HOME_NOTE_FEED_LIMIT = 60;

export type MemberHomeRouteData = {
  current: MemberHomeCurrentSessionResponse;
  noteFeedItems: MemberHomeNoteFeedItem[];
  upcomingSessions: MemberHomeUpcomingSession[];
};

export async function memberHomeLoader(args?: LoaderFunctionArgs): Promise<MemberHomeRouteData> {
  const access = await loadMemberAppAuth(args);
  const context = { clubSlug: clubSlugFromLoaderArgs(args) };

  if (!access.allowed) {
    return {
      current: { currentSession: null },
      noteFeedItems: [],
      upcomingSessions: [],
    };
  }

  const [current, noteFeed, upcomingSessions] = await Promise.all([
    fetchMemberHomeCurrentSession(context),
    fetchMemberHomeNoteFeed(context, { limit: MEMBER_HOME_NOTE_FEED_LIMIT }),
    fetchMemberHomeUpcomingSessions(context),
  ]);

  return { current, noteFeedItems: noteFeed.items, upcomingSessions };
}
