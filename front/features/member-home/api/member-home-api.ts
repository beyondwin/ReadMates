import { readmatesFetch, type ReadmatesApiContext } from "@/shared/api/client";
import type {
  MemberHomeCurrentSessionResponse,
  MemberHomeNoteFeedItem,
  MemberHomeUpcomingSession,
} from "@/features/member-home/api/member-home-contracts";
import { pagingSearchParams, type PagedResponse, type PageRequest } from "@/shared/model/paging";

export function fetchMemberHomeCurrentSession(context?: ReadmatesApiContext) {
  return readmatesFetch<MemberHomeCurrentSessionResponse>("/api/sessions/current", undefined, context);
}

export function fetchMemberHomeNoteFeed(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<PagedResponse<MemberHomeNoteFeedItem>>(`/api/notes/feed${pagingSearchParams(page)}`, undefined, context);
}

export function fetchMemberHomeUpcomingSessions(context?: ReadmatesApiContext) {
  return readmatesFetch<MemberHomeUpcomingSession[]>("/api/sessions/upcoming", undefined, context);
}
