import { redirect } from "react-router";
import { readmatesFetch } from "@/shared/api/client";
import type { AuthMeResponse, NormalizedAuthMeResponse } from "@/shared/auth/auth-contracts";
import { normalizeAuthAvailableSpaces } from "@/shared/auth/available-spaces";
import { recommendedClubEntryUrl } from "@/features/club-selection/model/club-entry";

export async function clubSelectionLoader() {
  const auth = normalizeAuthAvailableSpaces(
    await readmatesFetch<AuthMeResponse>("/api/auth/me", undefined, { clubSlug: undefined }),
  );
  const entryUrl = recommendedClubEntryUrl(auth);

  if (entryUrl && isAvailableClubSelectionEntry(auth, entryUrl)) {
    throw redirect(entryUrl);
  }

  return auth;
}

function isAvailableClubSelectionEntry(auth: NormalizedAuthMeResponse, entryUrl: string) {
  const match = /^\/clubs\/([^/?#]+)\/app(?:[/?#]|$)/.exec(entryUrl);
  if (!match || !auth.availableSpaces.kinds.includes("CLUBS")) {
    return false;
  }

  return auth.availableSpaces.clubs.some(
    (club) => club.clubSlug === match[1] && club.perspectives.includes("MEMBER"),
  );
}
