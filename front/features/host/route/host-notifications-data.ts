import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  fetchHostNotificationDeliveries,
  fetchHostNotificationEvents,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  fetchManualNotificationDispatches,
  fetchManualNotificationOptions,
} from "@/features/host/api/host-api";
import type {
  HostNotificationEventType,
  HostSessionListPage,
} from "@/features/host/api/host-contracts";
import {
  hostNotificationAuditQuery,
  hostNotificationDeliveriesQuery,
  hostNotificationEventsQuery,
  hostNotificationManualDispatchesQuery,
  hostNotificationManualOptionsQuery,
  hostNotificationSessionsQuery,
  hostNotificationSummaryQuery,
} from "@/features/host/queries/host-notification-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";

const HOST_NOTIFICATION_LEDGER_PAGE_LIMIT = 50;
const MANUAL_DISPATCH_PAGE_LIMIT = 20;
const MANUAL_MEMBER_PAGE_LIMIT = 50;

export type HostNotificationsRouteData = {
  initialManualSelection: {
    sessionId: string | null;
    eventType: HostNotificationEventType | null;
  };
};

function selectInitialManualSessionId(requestedSessionId: string | null, hostSessions: HostSessionListPage) {
  if (requestedSessionId && hostSessions.items.some((session) => session.sessionId === requestedSessionId)) {
    return requestedSessionId;
  }

  return hostSessions.items.find((session) => session.state === "OPEN")?.sessionId
    ?? hostSessions.items[0]?.sessionId
    ?? null;
}

export function hostNotificationsLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<HostNotificationsRouteData> => {
    await requireHostLoaderAuth(args);

    const context = { clubSlug: clubSlugFromLoaderArgs(args) };
    const url = args?.request ? new URL(args.request.url) : null;
    const sessionId = url?.searchParams.get("sessionId") ?? null;
    const eventType = (url?.searchParams.get("eventType") as HostNotificationEventType | null) ?? null;
    const ledgerPage = { limit: HOST_NOTIFICATION_LEDGER_PAGE_LIMIT };
    const dispatchPage = { limit: MANUAL_DISPATCH_PAGE_LIMIT };

    const [summary, events, deliveries, audit, hostSessions, manualDispatches] = await Promise.all([
      fetchHostNotificationSummary(context),
      fetchHostNotificationEvents(context, ledgerPage),
      fetchHostNotificationDeliveries(context, ledgerPage),
      fetchHostNotificationTestMailAudit(context, ledgerPage),
      client.fetchQuery(hostNotificationSessionsQuery(context)),
      fetchManualNotificationDispatches(context, { page: dispatchPage }),
    ]);

    const selectedSessionId = selectInitialManualSessionId(sessionId, hostSessions);
    const manualOptionsRequest = {
      sessionId: selectedSessionId ?? undefined,
      page: { limit: MANUAL_MEMBER_PAGE_LIMIT },
    };
    const manualOptions = await fetchManualNotificationOptions(context, manualOptionsRequest);

    client.setQueryData(hostNotificationSummaryQuery(context).queryKey, summary);
    client.setQueryData(hostNotificationEventsQuery(ledgerPage, context).queryKey, events);
    client.setQueryData(hostNotificationDeliveriesQuery(ledgerPage, context).queryKey, deliveries);
    client.setQueryData(hostNotificationAuditQuery(ledgerPage, context).queryKey, audit);
    client.setQueryData(hostNotificationManualDispatchesQuery({ page: dispatchPage }, context).queryKey, manualDispatches);
    client.setQueryData(hostNotificationManualOptionsQuery(manualOptionsRequest, context).queryKey, manualOptions);

    return {
      initialManualSelection: { sessionId: selectedSessionId, eventType },
    };
  };
}
