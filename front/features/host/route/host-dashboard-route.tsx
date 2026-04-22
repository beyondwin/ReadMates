import { useLoaderData } from "react-router-dom";
import {
  fetchHostCurrentSession,
  fetchHostDashboard,
  submitHostMemberLifecycle,
} from "@/features/host/api/host-api";
import HostDashboard, {
  type HostDashboardActions,
} from "@/features/host/components/host-dashboard";
import type { AuthMeResponse, CurrentSessionResponse } from "@/shared/api/readmates";
import type { HostDashboardResponse } from "@/features/host/api/host-contracts";

export type HostDashboardRouteData = {
  current: CurrentSessionResponse;
  data: HostDashboardResponse;
};

export async function hostDashboardLoader(): Promise<HostDashboardRouteData> {
  const [current, data] = await Promise.all([
    fetchHostCurrentSession(),
    fetchHostDashboard(),
  ]);

  return { current, data };
}

const hostDashboardActions = {
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

export function HostDashboardRoute({ auth }: { auth?: AuthMeResponse }) {
  const loaderData = useLoaderData() as HostDashboardRouteData;

  return (
    <HostDashboard
      auth={auth}
      current={loaderData.current}
      data={loaderData.data}
      actions={hostDashboardActions}
    />
  );
}
