import type { LoaderFunctionArgs } from "react-router";
import { clubSlugFromLoaderArgs, loadMemberAppAuth } from "@/shared/auth/member-app-loader";
import { fetchNotificationPreferences } from "../api/notification-preferences-api";
import type { NotificationPreferencesLoadState } from "../model/notification-preferences-model";
import { notificationPreferenceAvailability } from "../model/notification-preferences-model";

export type { NotificationPreferencesLoadState } from "../model/notification-preferences-model";

export async function memberNotificationSettingsLoader(
  args?: LoaderFunctionArgs,
): Promise<NotificationPreferencesLoadState> {
  const access = await loadMemberAppAuth(args);

  if (
    !access.allowed ||
    notificationPreferenceAvailability(access.auth.membershipStatus) === "unavailable"
  ) {
    return { status: "unavailable" };
  }

  try {
    const preferences = await fetchNotificationPreferences({
      clubSlug: clubSlugFromLoaderArgs(args),
    });
    return { status: "ready", preferences };
  } catch {
    return { status: "error" };
  }
}
