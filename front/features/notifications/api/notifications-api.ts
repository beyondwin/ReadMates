import { readmatesFetch, type ReadmatesApiContext } from "@/shared/api/client";
import type { MemberNotificationListResponse } from "./notifications-contracts";

export function fetchMemberNotifications(context?: ReadmatesApiContext): Promise<MemberNotificationListResponse> {
  return readmatesFetch<MemberNotificationListResponse>("/api/me/notifications", undefined, context);
}

export async function markMemberNotificationRead(id: string): Promise<void> {
  await readmatesFetch<void>(`/api/me/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function markAllMemberNotificationsRead(): Promise<{ updatedCount: number }> {
  return readmatesFetch<{ updatedCount: number }>("/api/me/notifications/read-all", { method: "POST" });
}
