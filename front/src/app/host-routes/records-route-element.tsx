import { HostMeetingListRoute } from "@/features/host/route/host-meeting-list-route";
import { Link } from "@/src/app/router-link";
import { readmatesReturnState } from "@/shared/routing/readmates-route-state";
import { useLocation } from "react-router";

export function HostRecordsRouteElement() {
  const location = useLocation();
  const recordsHref = `${location.pathname}${location.search}${location.hash}`;

  return (
    <HostMeetingListRoute
      LinkComponent={Link}
      detailLinkState={readmatesReturnState({ href: recordsHref, label: "기록으로" })}
    />
  );
}
