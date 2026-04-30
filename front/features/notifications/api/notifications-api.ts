import { readmatesFetch, type ReadmatesApiContext } from "@/shared/api/client";
import { pagingSearchParams, type PageRequest } from "@/shared/model/paging";
import type { MemberNotificationListResponse } from "./notifications-contracts";

export function fetchMemberNotifications(context?: ReadmatesApiContext, page?: PageRequest): Promise<MemberNotificationListResponse> {
  return readmatesFetch<MemberNotificationListResponse>(`/api/me/notifications${pagingSearchParams(page)}`, undefined, context);
}

export async function markMemberNotificationRead(id: string): Promise<void> {
  await readmatesFetch<void>(`/api/me/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function markAllMemberNotificationsRead(): Promise<{ updatedCount: number }> {
  return readmatesFetch<{ updatedCount: number }>("/api/me/notifications/read-all", { method: "POST" });
}
