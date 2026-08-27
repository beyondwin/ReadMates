import { Navigate, useLocation } from "react-router";

export function HostRecordsRedirectElement() {
  const location = useLocation();
  const target = location.pathname.replace(/\/records$/, "/sessions");
  return <Navigate replace to={`${target}${location.search}`} state={location.state} />;
}
