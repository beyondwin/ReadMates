// Local-state migration disposition (see plan 2026-05-18 Task 3):
// - hostSessionVisibilityOverrides: KEPT in `host-dashboard.tsx` as a fallback.
//   Removing it broke "flips local state on success" tests because the dashboard
//   UI consumed by tests has no QueryClientProvider wrapper. Query invalidations
//   still run via the mutation hooks below for the route-mounted dashboard.
// - appendedHostSessions: KEPT (transient pagination buffer).
// - locallyOpenedSessionId: KEPT (transient UX state).
// - pendingUpcomingAction / upcomingMessage: KEPT (pure UI affordances).
import { useMemo, useState } from "react";
import { useLoaderData, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import HostDashboard, { type HostDashboardLinkComponent } from "@/features/host/ui/host-dashboard";
import { ClubAiDefaultsSection } from "@/features/host/club/ui/ClubAiDefaultsSection";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { HostDashboardActions } from "@/features/host/route/host-dashboard-actions";
import { hostClubOperationsQuery } from "@/features/host/queries/host-club-operations-queries";
import { hostNotificationSummaryQuery } from "@/features/host/queries/host-notification-queries";
import {
  DEFAULT_HOST_SESSION_LIST_LIMIT,
  hostCurrentSessionQuery,
  hostDashboardQuery,
  hostSessionListQuery,
  useOpenHostSessionMutation,
  useSaveHostSessionVisibilityMutation,
} from "@/features/host/queries/host-session-queries";
import {
  hostSessionRecordLedgerQuery,
} from "@/features/host/queries/host-session-record-queries";
import type { ReadmatesApiContext } from "@/shared/api/client";
import { hostDashboardActions, type HostDashboardRouteData } from "./host-dashboard-data";
import {
  HostNotificationComposerController,
  type HostNotificationComposerRequest,
} from "./host-notification-composer-controller";

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext {
  return { clubSlug };
}

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
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => contextFromClubSlug(clubSlug), [clubSlug]);
  const queryClient = useQueryClient();
  const currentQuery = useQuery(hostCurrentSessionQuery(context));
  const dashboardQuery = useQuery(hostDashboardQuery(context));
  const sessionsQuery = useQuery(hostSessionListQuery({ limit: DEFAULT_HOST_SESSION_LIST_LIMIT }, context));
  const notificationsQuery = useQuery(hostNotificationSummaryQuery(context));
  const clubOperationsQuery = useQuery(hostClubOperationsQuery(context));
  const visibilityMutation = useSaveHostSessionVisibilityMutation(context);
  const openMutation = useOpenHostSessionMutation(context);
  const [composerRequest, setComposerRequest] =
    useState<HostNotificationComposerRequest | null>(null);
  const recordAttentionQuery = useQuery(hostSessionRecordLedgerQuery({
    needsAttention: true,
    page: { limit: 3 },
  }, context));
  const recordAttentionPage = recordAttentionQuery.data ?? loaderData.recordAttention;

  const actions = useMemo<HostDashboardActions>(() => ({
    updateCurrentSessionParticipation: hostDashboardActions.updateCurrentSessionParticipation,
    updateSessionVisibility: async (sessionId, request) => {
      const result = await visibilityMutation.mutateAsync({ sessionId, request });
      if (result.composer) {
        setComposerRequest({
          sessionId: result.composer.sessionId,
          eventType: result.composer.eventType,
          contentRevision: result.composer.contentRevision,
          origin: "FIRST_PUBLICATION",
        });
      }
    },
    openSession: async (sessionId) => {
      const response = await openMutation.mutateAsync(sessionId);
      if (!response.ok) {
        throw new Error("Host session open failed");
      }
    },
    loadHostSessions: (page) => queryClient.fetchQuery(hostSessionListQuery(page, context)),
  }), [context, openMutation, queryClient, visibilityMutation]);

  return (
    <>
      <HostDashboard
        auth={auth}
        current={currentQuery.data ?? loaderData.current}
        data={dashboardQuery.data ?? loaderData.data}
        hostSessions={sessionsQuery.data ?? loaderData.hostSessions}
        notifications={notificationsQuery.data ?? loaderData.notifications}
        clubOperations={clubOperationsQuery.data ?? loaderData.clubOperations}
        recordAttention={
          recordAttentionPage
            ? {
                items: recordAttentionPage.items,
                summary: recordAttentionPage.summary,
              }
            : recordAttentionQuery.isError
              ? null
              : {
                  items: [],
                  summary: {
                    needsAttentionCount: 0,
                    incompletePublishedCount: 0,
                    draftCount: 0,
                  },
                }
        }
        actions={actions}
        LinkComponent={LinkComponent}
        hostDashboardReturnTarget={hostDashboardReturnTarget}
        readmatesReturnState={readmatesReturnState}
      />
      <HostNotificationComposerController
        request={composerRequest}
        context={context}
        onClose={() => setComposerRequest(null)}
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
