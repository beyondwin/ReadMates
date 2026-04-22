import { useLocation } from "react-router-dom";
import {
  EditHostSessionRoute,
  HostDashboardRoute,
  NewHostSessionRoute,
} from "@/features/host";
import { useAuth } from "@/src/app/auth-state";
import { hostDashboardReturnTarget, readReadmatesReturnTarget } from "@/src/app/route-continuity";

export function HostDashboardRouteElement() {
  const authState = useAuth();

  return <HostDashboardRoute auth={authState.status === "ready" ? authState.auth : undefined} />;
}

export function NewHostSessionRouteElement() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);

  return <NewHostSessionRoute returnTarget={returnTarget} />;
}

export function EditHostSessionRouteElement() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);

  return <EditHostSessionRoute returnTarget={returnTarget} />;
}
