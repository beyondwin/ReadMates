import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  confirmAdminNotificationReplay,
  fetchAdminNotificationDeliveries,
  fetchAdminNotificationEvents,
  fetchAdminNotificationSnapshot,
  previewAdminNotificationReplay,
} from "@/features/platform-admin/api/platform-admin-notifications-api";
import type {
  AdminNotificationFilters,
  AdminNotificationReplayConfirmRequest,
  AdminNotificationReplayFilter,
} from "@/features/platform-admin/model/platform-admin-notifications-model";

function normalizeFilters(filters: AdminNotificationFilters = {}) {
  return {
    clubId: filters.clubId ?? null,
    eventStatus: filters.eventStatus ?? null,
    deliveryStatus: filters.deliveryStatus ?? null,
    channel: filters.channel ?? null,
    cursor: filters.cursor ?? null,
  };
}

export const platformAdminNotificationsKeys = {
  all: ["platform-admin", "notifications"] as const,
  snapshot: () => [...platformAdminNotificationsKeys.all, "snapshot"] as const,
  events: (filters?: AdminNotificationFilters) =>
    [...platformAdminNotificationsKeys.all, "events", normalizeFilters(filters)] as const,
  deliveries: (filters?: AdminNotificationFilters) =>
    [...platformAdminNotificationsKeys.all, "deliveries", normalizeFilters(filters)] as const,
} as const;

export function platformAdminNotificationSnapshotQuery() {
  return queryOptions({
    queryKey: platformAdminNotificationsKeys.snapshot(),
    queryFn: fetchAdminNotificationSnapshot,
  });
}

export function platformAdminNotificationEventsQuery(filters?: AdminNotificationFilters) {
  return queryOptions({
    queryKey: platformAdminNotificationsKeys.events(filters),
    queryFn: () => fetchAdminNotificationEvents(filters),
  });
}

export function platformAdminNotificationDeliveriesQuery(filters?: AdminNotificationFilters) {
  return queryOptions({
    queryKey: platformAdminNotificationsKeys.deliveries(filters),
    queryFn: () => fetchAdminNotificationDeliveries(filters),
  });
}

export function usePreviewAdminNotificationReplayMutation() {
  return useMutation({
    mutationFn: (filter: AdminNotificationReplayFilter = {}) => previewAdminNotificationReplay(filter),
  });
}

export function useConfirmAdminNotificationReplayMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AdminNotificationReplayConfirmRequest) => confirmAdminNotificationReplay(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformAdminNotificationsKeys.all }),
  });
}
