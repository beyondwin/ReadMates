import { redirect } from "react-router-dom";
import { readmatesFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { recommendedClubEntryUrl } from "@/features/club-selection/model/club-entry";

export async function clubSelectionLoader() {
  const auth = await readmatesFetch<AuthMeResponse>("/api/auth/me", undefined, { clubSlug: undefined });
  const entryUrl = recommendedClubEntryUrl(auth);

  if (entryUrl) {
    throw redirect(entryUrl);
  }

  return auth;
}
