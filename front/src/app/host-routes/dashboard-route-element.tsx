import { HostDashboardRoute } from "@/features/host/route/host-dashboard-route";
import { useAuth } from "@/src/app/auth-state";
import { hostDashboardReturnTarget, readmatesReturnState } from "@/src/app/route-continuity";
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
