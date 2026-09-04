import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import {
  platformAdminNotificationDeliveriesQuery,
  platformAdminNotificationEventsQuery,
  platformAdminNotificationSnapshotQuery,
} from "@/features/platform-admin/queries/platform-admin-notifications-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export function adminNotificationsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminNotifications(args?: LoaderFunctionArgs) {
    await requirePlatformAdminLoaderAuth(args);
    await Promise.all([
      queryClient.fetchQuery(platformAdminNotificationSnapshotQuery()),
      queryClient.fetchInfiniteQuery(platformAdminNotificationEventsQuery()),
      queryClient.fetchInfiniteQuery(platformAdminNotificationDeliveriesQuery()),
    ]);
    return null;
  };
}
