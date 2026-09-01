import { HostPersonDetailRoute } from "@/features/host/route/host-person-detail-route";
import { Link } from "@/src/app/router-link";

export function HostPersonDetailRouteElement() {
  return <HostPersonDetailRoute LinkComponent={Link} />;
}
