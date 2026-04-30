import { useLocation } from "react-router-dom";
import {
  EditHostSessionRoute,
  HostDashboardRoute,
  HostInvitationsRoute,
  HostMembersRoute,
  HostNotificationsRoute,
  NewHostSessionRoute,
} from "@/features/host";
import { useAuth } from "@/src/app/auth-state";
import { hostDashboardReturnTarget, readmatesReturnState, readReadmatesReturnTarget } from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";

export function HostDashboardRouteElement() {
  const authState = useAuth();

  return (
    <HostDashboardRoute
      auth={authState.status === "ready" ? authState.auth : undefined}
      LinkComponent={Link}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}

export function HostNotificationsRouteElement() {
  return <HostNotificationsRoute />;
}

export function HostMembersRouteElement() {
  return <HostMembersRoute LinkComponent={Link} />;
}

export function HostInvitationsRouteElement() {
  return <HostInvitationsRoute />;
}

export function NewHostSessionRouteElement() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);

  return (
    <NewHostSessionRoute
      returnTarget={returnTarget}
      LinkComponent={Link}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}

export function EditHostSessionRouteElement() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);

  return (
    <EditHostSessionRoute
      returnTarget={returnTarget}
      LinkComponent={Link}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}
