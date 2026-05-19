import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { invalidateArchiveQueries } from "@/features/archive/queries/archive-queries";
import { invalidateCurrentSession } from "@/features/current-session/queries/current-session-queries";
import { invalidateFeedbackQueries } from "@/features/feedback/queries/feedback-queries";
import { HostDashboardRoute } from "@/features/host/route/host-dashboard-route";
import { HostInvitationsRoute } from "@/features/host/route/host-invitations-route";
import { HostMembersRoute } from "@/features/host/route/host-members-route";
import { HostNotificationsRoute } from "@/features/host/route/host-notifications-route";
import {
  EditHostSessionRoute,
  type HostSessionRecordsChangedEvent,
  NewHostSessionRoute,
} from "@/features/host/route/host-session-editor-route";
import { invalidatePublicClubQueries } from "@/features/public/queries/public-queries";
import { useAuth } from "@/src/app/auth-state";
import { hostDashboardReturnTarget, readmatesReturnState, readReadmatesReturnTarget } from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";

function useSessionRecordsChangedInvalidation() {
  const queryClient = useQueryClient();

  return useCallback(
    async ({ clubSlug }: HostSessionRecordsChangedEvent) => {
      const context = { clubSlug };
      await Promise.all([
        invalidateCurrentSession(queryClient, context),
        invalidateArchiveQueries(queryClient, context),
        invalidateFeedbackQueries(queryClient, context),
        invalidatePublicClubQueries(queryClient, clubSlug),
      ]);
    },
    [queryClient],
  );
}

export function HostDashboardRouteElement() {
  const authState = useAuth();

  return (
    <HostDashboardRoute
      auth={authState.status === "ready" ? authState.auth : undefined}
      LinkComponent={Link}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}

export function HostNotificationsRouteElement() {
  return <HostNotificationsRoute />;
}

export function HostMembersRouteElement() {
  return <HostMembersRoute LinkComponent={Link} />;
}

export function HostInvitationsRouteElement() {
  return <HostInvitationsRoute />;
}

export function NewHostSessionRouteElement() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);
  const onSessionRecordsChanged = useSessionRecordsChangedInvalidation();

  return (
    <NewHostSessionRoute
      returnTarget={returnTarget}
      LinkComponent={Link}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
      onSessionRecordsChanged={onSessionRecordsChanged}
    />
  );
}

export function EditHostSessionRouteElement() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);
  const onSessionRecordsChanged = useSessionRecordsChangedInvalidation();

  return (
    <EditHostSessionRoute
      returnTarget={returnTarget}
      LinkComponent={Link}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
      onSessionRecordsChanged={onSessionRecordsChanged}
    />
  );
}
