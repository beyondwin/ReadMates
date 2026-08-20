import { Navigate, useLocation } from "react-router";
import { canonicalMeetingPath } from "./meeting-redirects";

export function HostSessionClosingRouteElement() {
  const location = useLocation();
  return (
    <Navigate replace to={canonicalMeetingPath(location.pathname, location.search)} state={location.state} />
  );
}
