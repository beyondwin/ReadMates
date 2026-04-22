import {
  fetchHostCurrentSession,
  fetchHostDashboard,
  submitHostMemberLifecycle,
} from "@/features/host/api/host-api";
import type { HostDashboardActions } from "@/features/host/components/host-dashboard";
import type { HostDashboardResponse } from "@/features/host/api/host-contracts";
import type { CurrentSessionResponse } from "@/shared/api/readmates";
import { requireHostLoaderAuth } from "./host-loader-auth";

export type HostDashboardRouteData = {
  current: CurrentSessionResponse;
  data: HostDashboardResponse;
};

export async function hostDashboardLoader(): Promise<HostDashboardRouteData> {
  await requireHostLoaderAuth();

  const [current, data] = await Promise.all([
    fetchHostCurrentSession(),
    fetchHostDashboard(),
  ]);

  return { current, data };
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
} satisfies HostDashboardActions;
