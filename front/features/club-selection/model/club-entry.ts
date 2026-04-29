const usableStatuses = new Set(["VIEWER", "ACTIVE", "SUSPENDED"]);

export type ClubEntryAuth = {
  authenticated: boolean;
  recommendedAppEntryUrl?: string | null;
  joinedClubs?: Array<{
    clubSlug: string;
    status: string;
  }>;
};

export function usableJoinedClubs<T extends { status: string }>(joinedClubs: T[] | undefined) {
  return (joinedClubs ?? []).filter((club) => usableStatuses.has(club.status));
}

export function recommendedClubEntryUrl(auth: ClubEntryAuth) {
  if (!auth.authenticated) {
    return "/login";
  }

  if (auth.recommendedAppEntryUrl && isSafeRecommendedEntryUrl(auth.recommendedAppEntryUrl)) {
    return auth.recommendedAppEntryUrl;
  }

  const usable = usableJoinedClubs(auth.joinedClubs);
  if (usable.length === 1) {
    return `/clubs/${encodeURIComponent(usable[0].clubSlug)}/app`;
  }

  return null;
}

function isSafeRecommendedEntryUrl(url: string) {
  return url === "/login" || /^\/clubs\/[^/?#]+\/app(?:[/?#]|$)/.test(url);
}
