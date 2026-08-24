import type { QueryClient } from "@tanstack/react-query";
import {
  platformAdminNotificationDeliveriesQuery,
  platformAdminNotificationEventsQuery,
  platformAdminNotificationSnapshotQuery,
} from "@/features/platform-admin/queries/platform-admin-notifications-queries";

export function adminNotificationsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminNotifications() {
    await Promise.all([
      queryClient.fetchQuery(platformAdminNotificationSnapshotQuery()),
      queryClient.fetchInfiniteQuery(platformAdminNotificationEventsQuery()),
      queryClient.fetchInfiniteQuery(platformAdminNotificationDeliveriesQuery()),
    ]);
    return null;
  };
}
