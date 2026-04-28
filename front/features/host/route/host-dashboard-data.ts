import {
  fetchHostCurrentSession,
  fetchHostDashboard,
  fetchHostNotificationSummary,
  fetchHostSessions,
  openHostSession,
  saveHostSessionVisibility,
  submitHostMemberLifecycle,
} from "@/features/host/api/host-api";
import type { HostDashboardActions } from "@/features/host/components/host-dashboard";
import { isReadmatesApiError } from "@/shared/api/errors";
import type {
  CurrentSessionResponse,
  HostDashboardResponse,
  HostNotificationSummary,
  HostSessionListItem,
} from "@/features/host/api/host-contracts";
import { requireHostLoaderAuth } from "./host-loader-auth";

const EMPTY_HOST_NOTIFICATION_SUMMARY: HostNotificationSummary = {
  pending: 0,
  failed: 0,
  dead: 0,
  sentLast24h: 0,
  latestFailures: [],
};

export type HostDashboardRouteData = {
  current: CurrentSessionResponse;
  data: HostDashboardResponse;
  hostSessions: HostSessionListItem[];
  notifications: HostNotificationSummary;
};

export async function hostDashboardLoader(): Promise<HostDashboardRouteData> {
  await requireHostLoaderAuth();

  const [current, data, hostSessions, notifications] = await Promise.all([
    fetchHostCurrentSession(),
    fetchHostDashboard(),
    fetchHostSessions(),
    fetchHostNotificationSummary().catch(notificationSummaryFallback),
  ]);

  return { current, data, hostSessions, notifications };
}

function notificationSummaryFallback(error: unknown): HostNotificationSummary {
  if (
    isReadmatesApiError(error) &&
    [404, 502, 503, 504].includes(error.status)
  ) {
    return EMPTY_HOST_NOTIFICATION_SUMMARY;
  }

  throw error;
}

export const hostDashboardActions = {
  updateCurrentSessionParticipation: async (membershipId, action) => {
    const response = await submitHostMemberLifecycle(
      membershipId,
      action === "add" ? "/current-session/add" : "/current-session/remove",
    );

    if (!response.ok) {
      throw new Error("Current session member action failed");
    }
  },
  updateSessionVisibility: async (sessionId, visibility) => {
    const response = await saveHostSessionVisibility(sessionId, { visibility });

    if (!response.ok) {
      throw new Error("Host session visibility update failed");
    }
  },
  openSession: async (sessionId) => {
    const response = await openHostSession(sessionId);

    if (!response.ok) {
      throw new Error("Host session open failed");
    }
  },
} satisfies HostDashboardActions;
