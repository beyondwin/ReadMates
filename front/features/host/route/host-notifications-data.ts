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
import { requireHostLoaderAuth } from "./host-loader-auth";

export type HostNotificationsRouteData = {
  summary: HostNotificationSummary;
  events: HostNotificationEventItem[];
  deliveries: HostNotificationDeliveryItem[];
  audit: NotificationTestMailAuditItem[];
};

export async function hostNotificationsLoader(): Promise<HostNotificationsRouteData> {
  await requireHostLoaderAuth();

  const [summary, events, deliveries, audit] = await Promise.all([
    fetchHostNotificationSummary(),
    fetchHostNotificationEvents(),
    fetchHostNotificationDeliveries(),
    fetchHostNotificationTestMailAudit(),
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
