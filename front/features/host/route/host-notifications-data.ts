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
  HostNotificationDeliveryItem,
  HostNotificationEventItem,
  HostNotificationSummary,
  NotificationTestMailAuditItem,
} from "@/features/host/api/host-contracts";
import type { LoaderFunctionArgs } from "react-router-dom";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export type HostNotificationsRouteData = {
  summary: HostNotificationSummary;
  events: HostNotificationEventItem[];
  deliveries: HostNotificationDeliveryItem[];
  audit: NotificationTestMailAuditItem[];
};

export async function hostNotificationsLoader(args?: LoaderFunctionArgs): Promise<HostNotificationsRouteData> {
  await requireHostLoaderAuth(args);
  const context = { clubSlug: clubSlugFromLoaderArgs(args) };

  const [summary, events, deliveries, audit] = await Promise.all([
    fetchHostNotificationSummary(context),
    fetchHostNotificationEvents(context),
    fetchHostNotificationDeliveries(context),
    fetchHostNotificationTestMailAudit(context),
  ]);

  return { summary, events: events.items, deliveries: deliveries.items, audit };
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
};
