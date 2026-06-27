import { HostMembersRoute } from "@/features/host/route/host-members-route";
import { Link } from "@/src/app/router-link";

export function HostMembersRouteElement() {
  return <HostMembersRoute LinkComponent={Link} />;
}
