import { useLoaderData, useRevalidator } from "react-router-dom";
import HostDashboard from "@/features/host/components/host-dashboard";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { hostDashboardActions, type HostDashboardRouteData } from "./host-dashboard-data";

export function HostDashboardRoute({ auth }: { auth?: AuthMeResponse }) {
  const loaderData = useLoaderData() as HostDashboardRouteData;
  const revalidator = useRevalidator();
  const actions = {
    ...hostDashboardActions,
    openSession: async (sessionId: string) => {
      await hostDashboardActions.openSession(sessionId);
      revalidator.revalidate();
    },
  };

  return (
    <HostDashboard
      auth={auth}
      current={loaderData.current}
      data={loaderData.data}
      hostSessions={loaderData.hostSessions}
      actions={actions}
    />
  );
}
