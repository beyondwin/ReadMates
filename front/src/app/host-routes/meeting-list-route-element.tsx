import { HostMeetingListRoute } from "@/features/host/route/host-meeting-list-route";
import { Link } from "@/src/app/router-link";

export function HostMeetingListRouteElement() {
  return <HostMeetingListRoute LinkComponent={Link} />;
}
