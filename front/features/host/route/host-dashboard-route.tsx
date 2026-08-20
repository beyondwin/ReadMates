import { useMemo } from "react";
import { Navigate, useLoaderData, useLocation, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import type {
  CurrentSessionResponse,
  HostSessionListItem,
  HostSessionRecordLedgerPage,
} from "@/features/host/api/host-contracts";
import {
  hostMeetingHref,
  resolveActiveMeeting,
  type MeetingListItem,
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

function meetingListItemsFromHostHome(
  sessions: readonly HostSessionListItem[],
  current: CurrentSessionResponse | undefined,
  attention: HostSessionRecordLedgerPage | undefined | null,
): MeetingListItem[] {
  const items = new Map<string, MeetingListItem>();

  const add = (item: MeetingListItem) => {
    const existing = items.get(item.sessionId);
    items.set(item.sessionId, {
      sessionId: item.sessionId,
      state: existing?.state ?? item.state,
      date: existing?.date ?? item.date,
      recordStatus: existing?.recordStatus ?? item.recordStatus,
    });
  };

  for (const session of sessions) {
    add({
      sessionId: session.sessionId,
      state: session.state,
      date: session.date,
      recordStatus: session.recordStatus,
    });
  }

  for (const item of attention?.items ?? []) {
    add({
      sessionId: item.sessionId,
      state: item.state,
      date: item.date,
      recordStatus: item.recordStatus,
    });
  }

  const currentSession = current?.currentSession;
  if (currentSession && !items.has(currentSession.sessionId)) {
    add({
      sessionId: currentSession.sessionId,
      state: "OPEN",
      date: currentSession.date,
    });
  }

  return [...items.values()];
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
    () => meetingListItemsFromHostHome(
      sessionsQuery.data?.items ?? loaderData.hostSessions.items,
      currentQuery.data ?? loaderData.current,
      recordAttentionQuery.data ?? loaderData.recordAttention,
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
