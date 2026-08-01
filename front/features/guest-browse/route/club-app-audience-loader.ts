import type { LoaderFunction, LoaderFunctionArgs } from "react-router-dom";
import { fetchGuestBrowseShell } from "@/features/guest-browse/api/guest-browse-api";
import type { GuestBrowseShell } from "@/features/guest-browse/api/guest-browse-contracts";
import { deriveClubAppAudience, type ClubAppAudience } from "@/features/guest-browse/model/club-app-audience";
import { readmatesPublicFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { authMePath, clubSlugFromLoaderArgs, type ClubScopedLoaderArgs } from "@/shared/auth/member-app-loader";

export type ClubAppAccess = {
  audience: ClubAppAudience;
  auth: AuthMeResponse;
  club: GuestBrowseShell | null;
};

export type GuestScopedRouteData = {
  guestRoute: true;
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
  const auth = await readmatesPublicFetch<AuthMeResponse>(authMePath(clubSlug));
  const audience = deriveClubAppAudience(auth);

  if (audience !== "GUEST") {
    return { audience, auth, club: null };
  }

  const club = await fetchGuestBrowseShell(clubSlug);

  return { audience, auth, club };
}

export async function loadScopedClubAppAccess(args?: LoaderFunctionArgs): Promise<ClubAppAccess> {
  return loadClubAppAudience(args);
}

export function scopedGuestRouteLoader(loadProtectedLoader: () => Promise<LoaderFunction>) {
  return async function guardedScopedRouteLoader(args: LoaderFunctionArgs) {
    const access = await loadClubAppAudience(args);

    if (access.audience === "GUEST") {
      return { guestRoute: true } satisfies GuestScopedRouteData;
    }

    const protectedLoader = await loadProtectedLoader();
    return protectedLoader(args);
  };
}

export function isGuestScopedRouteData(data: unknown): data is GuestScopedRouteData {
  return Boolean(data && typeof data === "object" && "guestRoute" in data && data.guestRoute === true);
}
