import { Navigate, useLocation } from "react-router";

export function HostOperationsRedirectElement() {
  const location = useLocation();
  const target = location.pathname.replace(/\/operations$/, "");
  return <Navigate replace to={`${target}${location.search}`} state={location.state} />;
}
