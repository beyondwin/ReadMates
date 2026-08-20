import { useLocation } from "react-router";
import { HostMeetingLedgerRoute } from "@/features/host/route/host-meeting-ledger-route";
import { EditHostSessionRoute } from "@/features/host/route/host-session-editor-route";
import { useSessionRecordsChangedInvalidation } from "@/src/app/host-route-invalidation";
import { hostDashboardReturnTarget, readmatesReturnState, readReadmatesReturnTarget } from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";

export function MeetingRouteElement() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);
  const onSessionRecordsChanged = useSessionRecordsChangedInvalidation();

  return (
    <HostMeetingLedgerRoute
      LinkComponent={({ to, className, children }) => (
        <Link to={to} className={className}>{children}</Link>
      )}
    >
      <EditHostSessionRoute
        returnTarget={returnTarget}
        LinkComponent={Link}
        hostDashboardReturnTarget={hostDashboardReturnTarget}
        readmatesReturnState={readmatesReturnState}
        onSessionRecordsChanged={onSessionRecordsChanged}
      />
    </HostMeetingLedgerRoute>
  );
}
