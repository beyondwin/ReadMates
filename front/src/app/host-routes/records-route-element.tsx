import { HostSessionLedgerRoute } from "@/features/host/route/host-session-ledger-route";
import { Link } from "@/src/app/router-link";

export function HostRecordsRouteElement() {
  return <HostSessionLedgerRoute LinkComponent={Link} />;
}
