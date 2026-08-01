import type { LoaderFunctionArgs } from "react-router-dom";
import { fetchGuestBrowseShell } from "@/features/guest-browse/api/guest-browse-api";
import type { GuestBrowseShell } from "@/features/guest-browse/api/guest-browse-contracts";
import { deriveClubAppAudience, type ClubAppAudience } from "@/features/guest-browse/model/club-app-audience";
import { readmatesPublicFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { authMePath, clubSlugFromLoaderArgs, type ClubScopedLoaderArgs } from "@/shared/auth/member-app-loader";

export type ClubAppAccess = {
  audience: ClubAppAudience;
  auth: AuthMeResponse;
  club: GuestBrowseShell;
};

function requiredClubSlug(args?: ClubScopedLoaderArgs) {
  const clubSlug = clubSlugFromLoaderArgs(args);
  if (!clubSlug) {
    throw new Response(null, { status: 404 });
  }
  return clubSlug;
}

export async function loadClubAppAudience(args?: Pick<LoaderFunctionArgs, "params">): Promise<ClubAppAccess> {
  const clubSlug = requiredClubSlug(args);
  const [auth, club] = await Promise.all([
    readmatesPublicFetch<AuthMeResponse>(authMePath(clubSlug)),
    fetchGuestBrowseShell(clubSlug),
  ]);

  return { audience: deriveClubAppAudience(auth), auth, club };
}
