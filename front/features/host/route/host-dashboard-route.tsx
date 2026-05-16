import { useLoaderData, useParams, useRevalidator } from "react-router-dom";
import HostDashboard, { type HostDashboardLinkComponent } from "@/features/host/ui/host-dashboard";
import { ClubAiDefaultsSection } from "@/features/host/club/ui/ClubAiDefaultsSection";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { hostDashboardActions, type HostDashboardRouteData } from "./host-dashboard-data";

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
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const actions = {
    ...hostDashboardActions,
    openSession: async (sessionId: string) => {
      await hostDashboardActions.openSession(sessionId);
      revalidator.revalidate();
    },
  };

  return (
    <>
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
      {clubSlug ? (
        <section className="container" style={{ padding: "0 0 48px" }}>
          <div className="rm-document-panel" style={{ padding: "22px" }}>
            <ClubAiDefaultsSection clubSlug={clubSlug} />
          </div>
        </section>
      ) : null}
    </>
  );
}
