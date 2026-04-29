import {
  fetchHostNotificationItems,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  processHostNotifications,
  restoreHostNotification,
  retryHostNotification,
  sendHostNotificationTestMail,
} from "@/features/host/api/host-api";
import type {
  HostNotificationItem,
  HostNotificationSummary,
  NotificationTestMailAuditItem,
} from "@/features/host/api/host-contracts";
import { requireHostLoaderAuth } from "./host-loader-auth";

export type HostNotificationsRouteData = {
  summary: HostNotificationSummary;
  items: HostNotificationItem[];
  audit: NotificationTestMailAuditItem[];
};

export async function hostNotificationsLoader(): Promise<HostNotificationsRouteData> {
  await requireHostLoaderAuth();

  const [summary, items, audit] = await Promise.all([
    fetchHostNotificationSummary(),
    fetchHostNotificationItems(),
    fetchHostNotificationTestMailAudit(),
  ]);

  return { summary, items: items.items, audit };
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
