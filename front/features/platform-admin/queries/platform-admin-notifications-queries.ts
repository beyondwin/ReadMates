import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
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
  const normalized = normalizeFilters(filters);
  return infiniteQueryOptions({
    queryKey: platformAdminNotificationsKeys.events(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchAdminNotificationEvents({ ...normalizedFilters(normalized), cursor: pageParam ?? undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function platformAdminNotificationDeliveriesQuery(filters?: AdminNotificationFilters) {
  const normalized = normalizeFilters(filters);
  return infiniteQueryOptions({
    queryKey: platformAdminNotificationsKeys.deliveries(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchAdminNotificationDeliveries({ ...normalizedFilters(normalized), cursor: pageParam ?? undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

function normalizedFilters(filters: ReturnType<typeof normalizeFilters>): AdminNotificationFilters {
  return {
    clubId: filters.clubId ?? undefined,
    eventStatus: filters.eventStatus ?? undefined,
    deliveryStatus: filters.deliveryStatus ?? undefined,
    channel: filters.channel ?? undefined,
  };
}

export function usePreviewAdminNotificationReplayMutation() {
  return useMutation({
    mutationKey: platformAdminNotificationsKeys.all,
    retry: 0,
    mutationFn: (filter: AdminNotificationReplayFilter = {}) => previewAdminNotificationReplay(filter),
  });
}

export function useConfirmAdminNotificationReplayMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: platformAdminNotificationsKeys.all,
    retry: 0,
    mutationFn: (request: AdminNotificationReplayConfirmRequest) => confirmAdminNotificationReplay(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformAdminNotificationsKeys.all }),
  });
}
