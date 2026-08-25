import { useLocation } from "react-router";
import { HostMeetingWorkspaceRoute } from "@/features/host/route/host-meeting-workspace-route";
import { useSessionRecordsChangedInvalidation } from "@/src/app/host-route-invalidation";
import { hostDashboardReturnTarget, readmatesReturnState, readReadmatesReturnTarget } from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";

export function MeetingRouteElement() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);
  const onSessionRecordsChanged = useSessionRecordsChangedInvalidation();

  return (
    <HostMeetingWorkspaceRoute
      returnTarget={returnTarget}
      LinkComponent={Link}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
      onSessionRecordsChanged={onSessionRecordsChanged}
    />
  );
}
