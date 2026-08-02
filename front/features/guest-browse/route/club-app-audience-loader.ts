import type { LoaderFunction, LoaderFunctionArgs } from "react-router";
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

export type GuestPublicRouteFailure = { status: number; retryAfterSeconds?: number };
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

  let club: GuestBrowseShell;
  try {
    club = await fetchGuestBrowseShell(clubSlug);
  } catch (error) {
    if (guestFailure(error)) {
      throw new GuestShellBrowseError(error);
    }
    throw error;
  }

  return { audience, auth, club };
}

class GuestShellBrowseError {
  constructor(readonly cause: unknown) {}
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
    let access: ClubAppAccess;
    try {
      access = await loadClubAppAudience(args);
    } catch (error) {
      if (error instanceof GuestShellBrowseError) {
        const failure = guestFailure(error.cause);
        if (failure) return { guestRoute: true, guestFailure: failure } satisfies GuestScopedRouteFailureData;
      }
      throw error;
    }

    if (access.audience === "GUEST") {
      let guestData: unknown;
      try {
        guestData = loadGuestLoader ? await loadGuestLoader(args) : undefined;
      } catch (error) {
        const failure = guestFailure(error);
        if (failure) return { guestRoute: true, guestFailure: failure } satisfies GuestScopedRouteFailureData;
        throw error;
      }
      return guestData === undefined
        ? ({ guestRoute: true } satisfies GuestScopedRouteData)
        : ({ guestRoute: true, guestData } satisfies GuestScopedRouteData);
    }

    const protectedLoader = await loadProtectedLoader();
    return protectedLoader(args);
  };
}

function guestFailure(error: unknown): GuestPublicRouteFailure | null {
  const status = isReadmatesApiError(error) ? error.status : error instanceof Response ? error.status : null;
  if (status !== 429 && (status === null || status < 500 || status >= 600)) return null;
  const retryAfter = isReadmatesApiError(error) ? retryAfterSeconds(error.response.headers.get("Retry-After")) : error instanceof Response ? retryAfterSeconds(error.headers.get("Retry-After")) : undefined;
  return { status, ...(retryAfter !== undefined ? { retryAfterSeconds: retryAfter } : {}) };
}

function retryAfterSeconds(value: string | null, now = Date.now()) {
  if (!value) return undefined;
  const delta = Number(value);
  const seconds = Number.isFinite(delta) && delta >= 0 ? Math.ceil(delta) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, 3600) : undefined;
}

export function isGuestScopedRouteData(data: unknown): data is GuestScopedRouteData {
  return Boolean(data && typeof data === "object" && "guestRoute" in data && data.guestRoute === true);
}
