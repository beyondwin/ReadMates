import {
  confirmManualNotification,
  fetchHostNotificationDeliveries,
  fetchHostNotificationEvents,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
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
  ManualNotificationOptionsResponse,
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
  manualOptions: ManualNotificationOptionsResponse;
  initialManualSelection: {
    sessionId: string | null;
    eventType: HostNotificationEventType | null;
  };
};

export async function hostNotificationsLoader(args?: LoaderFunctionArgs): Promise<HostNotificationsRouteData> {
  await requireHostLoaderAuth(args);
  const context = { clubSlug: clubSlugFromLoaderArgs(args) };
  const url = args?.request ? new URL(args.request.url) : null;
  const sessionId = url?.searchParams.get("sessionId") ?? null;
  const eventType = (url?.searchParams.get("eventType") as HostNotificationEventType | null) ?? null;

  const [summary, events, deliveries, audit, manualOptions] = await Promise.all([
    fetchHostNotificationSummary(context),
    fetchHostNotificationEvents(context, { limit: 50 }),
    fetchHostNotificationDeliveries(context, { limit: 50 }),
    fetchHostNotificationTestMailAudit(context, { limit: 50 }),
    fetchManualNotificationOptions(context, { sessionId: sessionId ?? undefined }),
  ]);

  return {
    summary,
    events,
    deliveries,
    audit,
    manualOptions,
    initialManualSelection: { sessionId, eventType },
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
  loadManualOptions: (sessionId?: string, page?: PageRequest) => fetchManualNotificationOptions(undefined, { sessionId, page }),
  loadEvents: (page?: PageRequest) => fetchHostNotificationEvents(undefined, page),
  loadDeliveries: (page?: PageRequest) => fetchHostNotificationDeliveries(undefined, page),
  loadAudit: (page?: PageRequest) => fetchHostNotificationTestMailAudit(undefined, page),
};
