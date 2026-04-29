import {
  fetchMemberNotifications,
  markAllMemberNotificationsRead,
  markMemberNotificationRead,
} from "../api/notifications-api";
import type { MemberNotificationListResponse } from "../api/notifications-contracts";
import type { LoaderFunctionArgs } from "react-router-dom";
import { clubSlugFromLoaderArgs, loadMemberAppAuth } from "@/shared/auth/member-app-loader";

export type MemberNotificationsRouteData = MemberNotificationListResponse;

export async function memberNotificationsLoader(args?: LoaderFunctionArgs): Promise<MemberNotificationsRouteData> {
  const access = await loadMemberAppAuth(args);

  if (!access.allowed) {
    return { items: [], unreadCount: 0 };
  }

  return fetchMemberNotifications({ clubSlug: clubSlugFromLoaderArgs(args) });
}

export const memberNotificationsActions = {
  markRead: markMemberNotificationRead,
  markAllRead: markAllMemberNotificationsRead,
};
