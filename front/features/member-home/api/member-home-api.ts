import { readmatesFetch, type ReadmatesApiContext } from "@/shared/api/client";
import type {
  MemberHomeCurrentSessionResponse,
  MemberHomeNoteFeedItem,
  MemberHomeUpcomingSession,
} from "@/features/member-home/api/member-home-contracts";

export function fetchMemberHomeCurrentSession(context?: ReadmatesApiContext) {
  return readmatesFetch<MemberHomeCurrentSessionResponse>("/api/sessions/current", undefined, context);
}

export function fetchMemberHomeNoteFeed(context?: ReadmatesApiContext) {
  return readmatesFetch<MemberHomeNoteFeedItem[]>("/api/notes/feed", undefined, context);
}

export function fetchMemberHomeUpcomingSessions(context?: ReadmatesApiContext) {
  return readmatesFetch<MemberHomeUpcomingSession[]>("/api/sessions/upcoming", undefined, context);
}
