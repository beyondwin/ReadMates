import { Navigate, useLocation, useRouteLoaderData } from "react-router";
import { AppRouteLayout } from "@/src/app/layouts/app-route-layout";
import { RequireHost } from "@/src/app/route-guards";
import {
  hostCompatibilityRedirectState,
  hostCompatibilityRedirectTarget,
  type HostCompatibilityLoaderData,
} from "@/src/app/route-continuity";
import { canonicalizeCompatibilityEntry } from "@/src/app/workspace-route-model";

export function CanonicalHostCompatibilityRoute() {
  const location = useLocation();
  const loaderData = useRouteLoaderData("app-host") as HostCompatibilityLoaderData | undefined;
  const currentClubSlug = loaderData?.hostCompatibilityClubSlug;
  const legacyTarget = hostCompatibilityRedirectTarget({ ...location, currentClubSlug });

  if (legacyTarget || !currentClubSlug) {
    return (
      <RequireHost>
        <AppRouteLayout />
      </RequireHost>
    );
  }

  const target = canonicalizeCompatibilityEntry({
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    currentClubSlug,
  });
  const targetPathname = target.split(/[?#]/, 1)[0] ?? target;
  return (
    <Navigate
      replace
      to={target}
      state={hostCompatibilityRedirectState(location.state, targetPathname)}
    />
  );
}
