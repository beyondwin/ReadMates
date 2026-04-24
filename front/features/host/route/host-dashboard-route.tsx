import { useLoaderData } from "react-router-dom";
import HostDashboard from "@/features/host/components/host-dashboard";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { hostDashboardActions, type HostDashboardRouteData } from "./host-dashboard-data";

export function HostDashboardRoute({ auth }: { auth?: AuthMeResponse }) {
  const loaderData = useLoaderData() as HostDashboardRouteData;

  return (
    <HostDashboard
      auth={auth}
      current={loaderData.current}
      data={loaderData.data}
      hostSessions={loaderData.hostSessions}
      actions={hostDashboardActions}
    />
  );
}
