import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import HostSessionEditor, { type HostSessionEditorLinkComponent } from "@/features/host/ui/host-session-editor";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";
import { invalidateHostNotifications } from "@/features/host/queries/host-notification-queries";
import {
  hostSessionDeletionPreviewQuery,
  hostSessionDetailQuery,
  hostSessionManualDispatchesQuery,
  useCloseHostSessionMutation,
  useCommitHostSessionImportMutation,
  useCreateHostSessionMutation,
  useDeleteHostSessionMutation,
  usePublishHostSessionMutation,
  useSaveHostSessionPublicationMutation,
  useUpdateHostSessionAttendanceMutation,
  useUpdateHostSessionMutation,
} from "@/features/host/queries/host-session-queries";
import {
  hostSessionEditorPreviewActions,
  type HostSessionEditorRouteData,
} from "./host-session-editor-data";

const EDITOR_MANUAL_DISPATCH_PAGE_LIMIT = 20;

type HostSessionEditorRouteProps = {
  returnTarget?: ReadmatesReturnTarget;
  LinkComponent?: HostSessionEditorLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
};

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext {
  return { clubSlug };
}

function useHostSessionEditorActions(context: ReadmatesApiContext): HostSessionEditorActions {
  const queryClient = useQueryClient();
  const { mutateAsync: createSession } = useCreateHostSessionMutation(context);
  const { mutateAsync: updateSession } = useUpdateHostSessionMutation(context);
  const { mutateAsync: deleteSession } = useDeleteHostSessionMutation(context);
  const { mutateAsync: closeSession } = useCloseHostSessionMutation(context);
  const { mutateAsync: publishSession } = usePublishHostSessionMutation(context);
  const { mutateAsync: savePublication } = useSaveHostSessionPublicationMutation(context);
  const { mutateAsync: updateAttendance } = useUpdateHostSessionAttendanceMutation(context);
  const { mutateAsync: commitImport } = useCommitHostSessionImportMutation(context);

  return useMemo<HostSessionEditorActions>(() => ({
    loadDeletionPreview: (sessionId) =>
      queryClient.fetchQuery(hostSessionDeletionPreviewQuery(sessionId, context)),
    deleteSession: (sessionId) => deleteSession(sessionId),
    closeSession: (sessionId) => closeSession(sessionId),
    publishSession: (sessionId) => publishSession(sessionId),
    saveSession: (sessionId, request) =>
      sessionId === null
        ? createSession(request)
        : updateSession({ sessionId, request }),
    savePublication: (sessionId, request) =>
      savePublication({ sessionId, request }),
    updateAttendance: (sessionId, attendance) =>
      updateAttendance({ sessionId, attendance }),
    previewSessionImport: hostSessionEditorPreviewActions.previewSessionImport,
    commitSessionImport: async (sessionId, request) => {
      const result = await commitImport({ sessionId, request });
      await invalidateHostNotifications(queryClient, context);
      return result;
    },
  }), [
    closeSession,
    commitImport,
    context,
    createSession,
    deleteSession,
    publishSession,
    queryClient,
    savePublication,
    updateAttendance,
    updateSession,
  ]);
}

export function NewHostSessionRoute({
  returnTarget,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: HostSessionEditorRouteProps) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => contextFromClubSlug(clubSlug), [clubSlug]);
  const actions = useHostSessionEditorActions(context);
  return (
    <HostSessionEditor
      returnTarget={returnTarget}
      actions={actions}
      clubSlug={clubSlug}
      LinkComponent={LinkComponent}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}

export function EditHostSessionRoute({
  returnTarget,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: HostSessionEditorRouteProps) {
  const loaderData = useLoaderData() as HostSessionEditorRouteData;
  const { clubSlug, sessionId: routeSessionId } = useParams<{ clubSlug: string; sessionId: string }>();
  const sessionId = routeSessionId ?? loaderData.sessionId;
  const context = useMemo(() => contextFromClubSlug(clubSlug), [clubSlug]);
  const actions = useHostSessionEditorActions(context);
  const sessionQuery = useQuery(hostSessionDetailQuery(sessionId, context));
  const dispatchesQuery = useQuery(hostSessionManualDispatchesQuery(
    { sessionId, page: { limit: EDITOR_MANUAL_DISPATCH_PAGE_LIMIT } },
    context,
  ));

  if (!sessionQuery.data) {
    return null;
  }

  return (
    <HostSessionEditor
      session={sessionQuery.data}
      notificationDispatches={dispatchesQuery.data?.items ?? []}
      returnTarget={returnTarget}
      actions={actions}
      clubSlug={clubSlug}
      LinkComponent={LinkComponent}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}
