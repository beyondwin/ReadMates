import {
  confirmManualNotification,
  fetchHostNotificationDeliveries,
  fetchHostNotificationEvents,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  fetchHostSessions,
  fetchManualNotificationDispatches,
  fetchManualNotificationOptions,
  previewManualNotification,
  processHostNotifications,
  restoreHostNotification,
  retryHostNotification,
  sendHostNotificationTestMail,
} from "@/features/host/api/host-api";
import type {
  HostNotificationDeliveryListResponse,
  HostNotificationEventType,
  HostNotificationEventListResponse,
  HostNotificationSummary,
  HostSessionListPage,
  ManualNotificationOptionsResponse,
  ManualNotificationDispatchListResponse,
  NotificationTestMailAuditPage,
} from "@/features/host/api/host-contracts";
import type { PageRequest } from "@/shared/model/paging";
import type { LoaderFunctionArgs } from "react-router-dom";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export type HostNotificationsRouteData = {
  summary: HostNotificationSummary;
  events: HostNotificationEventListResponse;
  deliveries: HostNotificationDeliveryListResponse;
  audit: NotificationTestMailAuditPage;
  hostSessions: HostSessionListPage;
  manualOptions: ManualNotificationOptionsResponse;
  manualDispatches: ManualNotificationDispatchListResponse;
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

export async function hostNotificationsLoader(args?: LoaderFunctionArgs): Promise<HostNotificationsRouteData> {
  await requireHostLoaderAuth(args);
  const context = { clubSlug: clubSlugFromLoaderArgs(args) };
  const url = args?.request ? new URL(args.request.url) : null;
  const sessionId = url?.searchParams.get("sessionId") ?? null;
  const eventType = (url?.searchParams.get("eventType") as HostNotificationEventType | null) ?? null;

  const [summary, events, deliveries, audit, hostSessions, manualDispatches] = await Promise.all([
    fetchHostNotificationSummary(context),
    fetchHostNotificationEvents(context, { limit: 50 }),
    fetchHostNotificationDeliveries(context, { limit: 50 }),
    fetchHostNotificationTestMailAudit(context, { limit: 50 }),
    fetchHostSessions(context),
    fetchManualNotificationDispatches(context, { page: { limit: 20 } }),
  ]);
  const selectedSessionId = selectInitialManualSessionId(sessionId, hostSessions);
  const manualOptions = await fetchManualNotificationOptions(context, { sessionId: selectedSessionId ?? undefined });

  return {
    summary,
    events,
    deliveries,
    audit,
    hostSessions,
    manualOptions,
    manualDispatches,
    initialManualSelection: { sessionId: selectedSessionId, eventType },
  };
}

export const hostNotificationsActions = {
  process: async () => {
    const response = await processHostNotifications();
    if (!response.ok) {
      throw new Error("Notification process failed");
    }
  },
  retry: retryHostNotification,
  restore: restoreHostNotification,
  sendTestMail: sendHostNotificationTestMail,
  previewManual: previewManualNotification,
  confirmManual: confirmManualNotification,
  loadManualOptions: (sessionId?: string, search?: string, page?: PageRequest) => fetchManualNotificationOptions(undefined, { sessionId, search, page }),
  loadManualDispatches: (page?: PageRequest) => fetchManualNotificationDispatches(undefined, { page }),
  loadEvents: (page?: PageRequest) => fetchHostNotificationEvents(undefined, page),
  loadDeliveries: (page?: PageRequest) => fetchHostNotificationDeliveries(undefined, page),
  loadAudit: (page?: PageRequest) => fetchHostNotificationTestMailAudit(undefined, page),
};
