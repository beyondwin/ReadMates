import { useLoaderData, useRevalidator } from "react-router-dom";
import HostDashboard, { type HostDashboardLinkComponent } from "@/features/host/ui/host-dashboard";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { hostDashboardActions, type HostDashboardRouteData } from "./host-dashboard-data";

type ReadmatesReturnState = {
  readmatesReturnTo: string;
  readmatesReturnLabel: string;
  readmatesReturnState?: ReadmatesReturnState;
};

type ReadmatesReturnTarget = {
  href: string;
  label: string;
  state?: ReadmatesReturnState;
};

export function HostDashboardRoute({
  auth,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: {
  auth?: AuthMeResponse;
  LinkComponent?: HostDashboardLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
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
      notifications={loaderData.notifications}
      actions={actions}
      LinkComponent={LinkComponent}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}
