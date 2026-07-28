import { readmatesFetch, type ReadmatesApiContext } from "@/shared/api/client";
import type {
  NotificationPreferencesRequest,
  NotificationPreferencesResponse,
} from "./notification-preferences-contracts";

export function fetchNotificationPreferences(
  context?: ReadmatesApiContext,
) {
  return readmatesFetch<NotificationPreferencesResponse>(
    "/api/me/notifications/preferences",
    undefined,
    context,
  );
}

export function saveNotificationPreferences(
  request: NotificationPreferencesRequest,
) {
  return readmatesFetch<NotificationPreferencesResponse>(
    "/api/me/notifications/preferences",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
}
