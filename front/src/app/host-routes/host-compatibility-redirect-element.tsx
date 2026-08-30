import { Navigate, useLocation } from "react-router";
import {
  hostCompatibilityRedirectState,
  hostCompatibilityRedirectTarget,
} from "@/src/app/route-continuity";

export function HostCompatibilityRedirectElement() {
  const location = useLocation();
  const target = hostCompatibilityRedirectTarget(location);

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
