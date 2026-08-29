import { HostMeetingListRoute } from "@/features/host/route/host-meeting-list-route";
import { Link } from "@/src/app/router-link";

export function HostRecordsRouteElement() {
  return <HostMeetingListRoute LinkComponent={Link} />;
}
