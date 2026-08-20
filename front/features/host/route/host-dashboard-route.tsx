import { useMemo } from "react";
import { Navigate, useLoaderData, useLocation, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import {
  hostMeetingHref,
  meetingListItemsFromHostSources,
  resolveActiveMeeting,
} from "@/features/host/model/host-meeting-ledger-model";
import {
  DEFAULT_HOST_SESSION_LIST_LIMIT,
  hostCurrentSessionQuery,
  hostSessionListQuery,
} from "@/features/host/queries/host-session-queries";
import { hostSessionRecordLedgerQuery } from "@/features/host/queries/host-session-record-queries";
import type { HostDashboardLinkComponent } from "@/features/host/ui/dashboard/types";
import {
  HostMeetingLedger,
  type HostMeetingLedgerLinkComponent,
} from "@/features/host/ui/meeting-ledger/host-meeting-ledger";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { HostDashboardRouteData } from "./host-dashboard-data";

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext {
  return { clubSlug };
}

export function HostDashboardRoute({
  LinkComponent,
}: {
  auth?: AuthMeResponse;
  LinkComponent?: HostDashboardLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
  const loaderData = useLoaderData() as HostDashboardRouteData;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const location = useLocation();
  const context = useMemo(() => contextFromClubSlug(clubSlug), [clubSlug]);
  const currentQuery = useQuery(hostCurrentSessionQuery(context));
  const sessionsQuery = useQuery(hostSessionListQuery({ limit: DEFAULT_HOST_SESSION_LIST_LIMIT }, context));
  const recordAttentionQuery = useQuery(hostSessionRecordLedgerQuery({
    needsAttention: true,
    page: { limit: 3 },
  }, context));

  const items = useMemo(
    () => meetingListItemsFromHostSources(
      sessionsQuery.data?.items ?? loaderData.hostSessions.items,
      (recordAttentionQuery.data ?? loaderData.recordAttention)?.items,
      (currentQuery.data ?? loaderData.current).currentSession,
    ),
    [currentQuery.data, loaderData, recordAttentionQuery.data, sessionsQuery.data],
  );
  const active = useMemo(() => resolveActiveMeeting(items), [items]);
  const ledgerLink = useMemo<HostMeetingLedgerLinkComponent | undefined>(() => {
    if (!LinkComponent) {
      return undefined;
    }
    return function HostHomeLedgerLink({ to, className, children }) {
      return (
        <LinkComponent to={to} className={className}>
          {children}
        </LinkComponent>
      );
    };
  }, [LinkComponent]);

  if (active) {
    return (
      <Navigate
        replace
        to={scopedAppLinkTarget(location.pathname, hostMeetingHref(active.sessionId))}
      />
    );
  }

  return (
    <HostMeetingLedger
      items={items}
      LinkComponent={ledgerLink}
    />
  );
}
