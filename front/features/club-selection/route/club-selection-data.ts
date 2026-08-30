import { redirect } from "react-router";
import { readmatesFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { normalizeAuthAvailableSpaces } from "@/shared/auth/available-spaces";
import { recommendedClubEntryUrl } from "@/features/club-selection/model/club-entry";

export async function clubSelectionLoader() {
  const auth = normalizeAuthAvailableSpaces(
    await readmatesFetch<AuthMeResponse>("/api/auth/me", undefined, { clubSlug: undefined }),
  );
  const entryUrl = recommendedClubEntryUrl(auth);

  if (entryUrl) {
    throw redirect(entryUrl);
  }

  return auth;
}
