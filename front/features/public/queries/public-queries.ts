import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { fetchPublicClub, fetchPublicSession } from "@/features/public/api/public-api";
import type { PublicClubResponse, PublicSessionDetailResponse } from "@/features/public/api/public-contracts";

const PUBLIC_STALE_TIME_MS = 60 * 1000;

export const publicKeys = {
  all: ["public"] as const,
  club: (clubSlug: string) => [...publicKeys.all, "club", clubSlug] as const,
  session: (clubSlug: string, sessionId: string) =>
    [...publicKeys.club(clubSlug), "session", sessionId] as const,
} as const;

export function publicClubQuery(clubSlug: string) {
  return queryOptions<PublicClubResponse>({
    queryKey: publicKeys.club(clubSlug),
    queryFn: () => fetchPublicClub(clubSlug),
    staleTime: PUBLIC_STALE_TIME_MS,
  });
}

export function publicSessionQuery(clubSlug: string, sessionId: string) {
  return queryOptions<PublicSessionDetailResponse | null>({
    queryKey: publicKeys.session(clubSlug, sessionId),
    queryFn: () => fetchPublicSession(clubSlug, sessionId),
    staleTime: PUBLIC_STALE_TIME_MS,
  });
}

export function invalidatePublicClubQueries(client: QueryClient, clubSlug: string | null | undefined) {
  if (!clubSlug) {
    return Promise.resolve();
  }

  return client.invalidateQueries({ queryKey: publicKeys.club(clubSlug) });
}
