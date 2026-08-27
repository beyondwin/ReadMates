import { Navigate, useLocation } from "react-router";

export function HostInvitationsRedirectElement() {
  const location = useLocation();
  const target = location.pathname.replace(/\/invitations$/, "/members");
  return <Navigate replace to={`${target}${location.search}`} state={location.state} />;
}
