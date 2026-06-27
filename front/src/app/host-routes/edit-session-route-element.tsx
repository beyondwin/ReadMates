import { useLocation } from "react-router-dom";
import { EditHostSessionRoute } from "@/features/host/route/host-session-editor-route";
import { useSessionRecordsChangedInvalidation } from "@/src/app/host-route-invalidation";
import { hostDashboardReturnTarget, readmatesReturnState, readReadmatesReturnTarget } from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";

export function EditHostSessionRouteElement() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);
  const onSessionRecordsChanged = useSessionRecordsChangedInvalidation();

  return (
    <EditHostSessionRoute
      returnTarget={returnTarget}
      LinkComponent={Link}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
      onSessionRecordsChanged={onSessionRecordsChanged}
    />
  );
}
