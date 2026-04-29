import {
  fetchMemberNotifications,
  markAllMemberNotificationsRead,
  markMemberNotificationRead,
} from "../api/notifications-api";
import type { MemberNotificationListResponse } from "../api/notifications-contracts";

export type MemberNotificationsRouteData = MemberNotificationListResponse;

export function memberNotificationsLoader(): Promise<MemberNotificationsRouteData> {
  return fetchMemberNotifications();
}

export const memberNotificationsActions = {
  markRead: markMemberNotificationRead,
  markAllRead: markAllMemberNotificationsRead,
};
