import { useMemo } from "react";
import { useLoaderData } from "react-router";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { HostLinkComponent } from "@/features/host/ui/host-link-types";
import {
  HostMeetingLedger,
  type HostMeetingLedgerLinkComponent,
} from "@/features/host/ui/meeting-ledger/host-meeting-ledger";
import type { HostDashboardRouteData } from "./host-dashboard-data";

export function HostDashboardRoute({
  LinkComponent,
}: {
  auth?: AuthMeResponse;
  LinkComponent?: HostLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
  const loaderData = useLoaderData() as HostDashboardRouteData;
  const ledgerLink = useMemo<HostMeetingLedgerLinkComponent | undefined>(() => {
    if (!LinkComponent) {
      return undefined;
    }
    return function HostHomeLedgerLink({ to, className, children, ...props }) {
      return (
        <LinkComponent to={to} className={className} {...props}>
          {children}
        </LinkComponent>
      );
    };
  }, [LinkComponent]);

  return (
    <HostMeetingLedger
      items={[]}
      attentionPage={loaderData.recordAttention}
      LinkComponent={ledgerLink}
    />
  );
}
