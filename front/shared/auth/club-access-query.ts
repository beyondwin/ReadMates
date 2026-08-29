import { touchClubAccess } from "./club-access-api";

type TouchClubAccess = (clubSlug: string) => Promise<unknown>;

export function touchClubAccessOnce(
  touchedClubSlugs: Set<string>,
  clubSlug: string,
  touch: TouchClubAccess = touchClubAccess,
) {
  if (touchedClubSlugs.has(clubSlug)) {
    return;
  }

  touchedClubSlugs.add(clubSlug);
  void touch(clubSlug).catch(() => undefined);
}
