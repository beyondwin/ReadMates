import type { LoaderFunction, LoaderFunctionArgs } from "react-router-dom";
import { fetchGuestBrowseShell } from "@/features/guest-browse/api/guest-browse-api";
import type { GuestBrowseShell } from "@/features/guest-browse/api/guest-browse-contracts";
import { deriveClubAppAudience, type ClubAppAudience } from "@/features/guest-browse/model/club-app-audience";
import { readmatesPublicFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { authMePath, clubSlugFromLoaderArgs, type ClubScopedLoaderArgs } from "@/shared/auth/member-app-loader";
import { isReadmatesApiError } from "@/shared/api/errors";

export type ClubAppAccess = {
  audience: ClubAppAudience;
  auth: AuthMeResponse;
  club: GuestBrowseShell | null;
};

export type GuestScopedRouteData = {
  guestRoute: true;
  guestData?: unknown;
};

export type GuestPublicRouteFailure = { status?: number };
export type GuestScopedRouteFailureData = GuestScopedRouteData & { guestFailure: GuestPublicRouteFailure };

const pendingAudienceAccesses = new WeakMap<Request, Promise<ClubAppAccess>>();

function requiredClubSlug(args?: ClubScopedLoaderArgs) {
  const clubSlug = clubSlugFromLoaderArgs(args);
  if (!clubSlug) {
    throw new Response(null, { status: 404 });
  }
  return clubSlug;
}

async function loadClubAppAudienceForRequest(args?: Pick<LoaderFunctionArgs, "params" | "request">): Promise<ClubAppAccess> {
  const clubSlug = requiredClubSlug(args);
  const auth = await readmatesPublicFetch<AuthMeResponse>(authMePath(clubSlug));
  const audience = deriveClubAppAudience(auth);

  if (audience !== "GUEST") {
    return { audience, auth, club: null };
  }

  const club = await fetchGuestBrowseShell(clubSlug);

  return { audience, auth, club };
}

export function loadClubAppAudience(args?: Pick<LoaderFunctionArgs, "params" | "request">): Promise<ClubAppAccess> {
  const request = args?.request;
  if (!request) {
    return loadClubAppAudienceForRequest(args);
  }

  const existing = pendingAudienceAccesses.get(request);
  if (existing) {
    return existing;
  }

  const pending = loadClubAppAudienceForRequest(args);
  pendingAudienceAccesses.set(request, pending);
  void pending.then(
    () => pendingAudienceAccesses.delete(request),
    () => pendingAudienceAccesses.delete(request),
  );
  return pending;
}

export async function loadScopedClubAppAccess(args?: LoaderFunctionArgs): Promise<ClubAppAccess> {
  return loadClubAppAudience(args);
}

export function scopedGuestRouteLoader(
  loadProtectedLoader: () => Promise<LoaderFunction>,
  loadGuestLoader?: LoaderFunction,
) {
  return async function guardedScopedRouteLoader(args: LoaderFunctionArgs) {
    const access = await loadClubAppAudience(args);

    if (access.audience === "GUEST") {
      let guestData: unknown;
      try {
        guestData = loadGuestLoader ? await loadGuestLoader(args) : undefined;
      } catch (error) {
        return { guestRoute: true, guestFailure: guestFailure(error) } satisfies GuestScopedRouteFailureData;
      }
      return guestData === undefined
        ? ({ guestRoute: true } satisfies GuestScopedRouteData)
        : ({ guestRoute: true, guestData } satisfies GuestScopedRouteData);
    }

    const protectedLoader = await loadProtectedLoader();
    return protectedLoader(args);
  };
}

function guestFailure(error: unknown): GuestPublicRouteFailure {
  if (isReadmatesApiError(error)) return { status: error.status };
  if (error instanceof Response) return { status: error.status };
  return {};
}

export function isGuestScopedRouteData(data: unknown): data is GuestScopedRouteData {
  return Boolean(data && typeof data === "object" && "guestRoute" in data && data.guestRoute === true);
}
