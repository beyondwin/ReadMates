import { Navigate, useLocation, useRouteLoaderData } from "react-router";
import {
  hostCompatibilityRedirectState,
  hostCompatibilityRedirectTarget,
  type HostCompatibilityLoaderData,
} from "@/src/app/route-continuity";

export function HostCompatibilityRedirectElement() {
  const location = useLocation();
  const loaderData = useRouteLoaderData("app-host") as HostCompatibilityLoaderData | undefined;
  const target = hostCompatibilityRedirectTarget({
    ...location,
    currentClubSlug: loaderData?.hostCompatibilityClubSlug,
  });

  if (!target) {
    return null;
  }

  const targetPathname = target.split(/[?#]/, 1)[0] ?? target;
  return (
    <Navigate
      replace
      to={target}
      state={hostCompatibilityRedirectState(location.state, targetPathname)}
    />
  );
}
