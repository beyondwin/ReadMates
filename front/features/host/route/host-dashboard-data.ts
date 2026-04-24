import {
  fetchHostCurrentSession,
  fetchHostDashboard,
  fetchHostSessions,
  openHostSession,
  saveHostSessionVisibility,
  submitHostMemberLifecycle,
} from "@/features/host/api/host-api";
import type { HostDashboardActions } from "@/features/host/components/host-dashboard";
import type {
  CurrentSessionResponse,
  HostDashboardResponse,
  HostSessionListItem,
} from "@/features/host/api/host-contracts";
import { requireHostLoaderAuth } from "./host-loader-auth";

export type HostDashboardRouteData = {
  current: CurrentSessionResponse;
  data: HostDashboardResponse;
  hostSessions: HostSessionListItem[];
};

export async function hostDashboardLoader(): Promise<HostDashboardRouteData> {
  await requireHostLoaderAuth();

  const [current, data, hostSessions] = await Promise.all([
    fetchHostCurrentSession(),
    fetchHostDashboard(),
    fetchHostSessions(),
  ]);

  return { current, data, hostSessions };
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
