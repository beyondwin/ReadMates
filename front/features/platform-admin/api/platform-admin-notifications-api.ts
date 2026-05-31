import { readmatesFetch } from "@/shared/api/client";
import type { CursorPage } from "@/shared/query/cursor-pagination";
import type {
  AdminNotificationDelivery,
  AdminNotificationFilters,
  AdminNotificationOperationsSnapshot,
  AdminNotificationOutboxEvent,
  AdminNotificationReplayConfirmRequest,
  AdminNotificationReplayConfirmResult,
  AdminNotificationReplayFilter,
  AdminNotificationReplayPreview,
} from "@/features/platform-admin/model/platform-admin-notifications-model";

function notificationSearch(filters: AdminNotificationFilters): string {
  const params = new URLSearchParams();
  if (filters.clubId) params.set("clubId", filters.clubId);
  if (filters.eventStatus) params.set("status", filters.eventStatus);
  if (filters.deliveryStatus) params.set("status", filters.deliveryStatus);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.cursor) params.set("cursor", filters.cursor);
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function fetchAdminNotificationSnapshot() {
  return readmatesFetch<AdminNotificationOperationsSnapshot>(
    "/api/admin/notifications/snapshot",
    undefined,
    { clubSlug: undefined },
  );
}

export function fetchAdminNotificationEvents(filters: AdminNotificationFilters = {}) {
  return readmatesFetch<CursorPage<AdminNotificationOutboxEvent>>(
    `/api/admin/notifications/events${notificationSearch(filters)}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function fetchAdminNotificationDeliveries(filters: AdminNotificationFilters = {}) {
  return readmatesFetch<CursorPage<AdminNotificationDelivery>>(
    `/api/admin/notifications/deliveries${notificationSearch(filters)}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function previewAdminNotificationReplay(filter: AdminNotificationReplayFilter = {}) {
  return readmatesFetch<AdminNotificationReplayPreview>(
    "/api/admin/notifications/replay-preview",
    { method: "POST", body: JSON.stringify({ filter }) },
    { clubSlug: undefined },
  );
}

export function confirmAdminNotificationReplay(request: AdminNotificationReplayConfirmRequest) {
  return readmatesFetch<AdminNotificationReplayConfirmResult>(
    "/api/admin/notifications/replay-confirm",
    { method: "POST", body: JSON.stringify(request) },
    { clubSlug: undefined },
  );
}
