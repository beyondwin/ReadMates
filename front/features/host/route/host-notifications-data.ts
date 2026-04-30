import {
  fetchHostNotificationDeliveries,
  fetchHostNotificationEvents,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  processHostNotifications,
  restoreHostNotification,
  retryHostNotification,
  sendHostNotificationTestMail,
} from "@/features/host/api/host-api";
import type {
  HostNotificationDeliveryListResponse,
  HostNotificationEventListResponse,
  HostNotificationSummary,
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
};

export async function hostNotificationsLoader(args?: LoaderFunctionArgs): Promise<HostNotificationsRouteData> {
  await requireHostLoaderAuth(args);
  const context = { clubSlug: clubSlugFromLoaderArgs(args) };

  const [summary, events, deliveries, audit] = await Promise.all([
    fetchHostNotificationSummary(context),
    fetchHostNotificationEvents(context, { limit: 50 }),
    fetchHostNotificationDeliveries(context, { limit: 50 }),
    fetchHostNotificationTestMailAudit(context, { limit: 50 }),
  ]);

  return { summary, events, deliveries, audit };
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
  loadEvents: (page?: PageRequest) => fetchHostNotificationEvents(undefined, page),
  loadDeliveries: (page?: PageRequest) => fetchHostNotificationDeliveries(undefined, page),
  loadAudit: (page?: PageRequest) => fetchHostNotificationTestMailAudit(undefined, page),
};
