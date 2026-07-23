import { useCallback, useEffect, useMemo } from "react";
import { useBlocker, useLoaderData, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import HostSessionEditor, { type HostSessionEditorLinkComponent } from "@/features/host/ui/host-session-editor";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";
import { invalidateHostNotifications } from "@/features/host/queries/host-notification-queries";
import type {
  HostSessionHistoryItem,
  HostSessionRecordEditor,
} from "@/features/host/api/host-session-record-contracts";
import type {
  HostSessionDetailResponse,
  ManualNotificationDispatchListItem,
} from "@/features/host/api/host-contracts";
import {
  hostSessionRecordEditorQuery,
  hostSessionRecordHistoryQuery,
  useRestoreHostSessionRevisionToDraftMutation,
  useSaveHostSessionRecordDraftMutation,
} from "@/features/host/queries/host-session-record-queries";
import { useSessionRecordDraftController } from "@/features/host/hooks/use-session-record-draft-controller";
import {
  hostSessionDeletionPreviewQuery,
  hostSessionDetailQuery,
  invalidateHostSessionRecordSurfaces,
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
const EDITOR_HISTORY_PAGE_LIMIT = 30;

type HostSessionEditorRouteProps = {
  returnTarget?: ReadmatesReturnTarget;
  LinkComponent?: HostSessionEditorLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
  onSessionRecordsChanged?: (event: HostSessionRecordsChangedEvent) => void | Promise<void>;
};

export type HostSessionRecordsChangedEvent = {
  sessionId: string;
  clubSlug?: string;
};

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext {
  return { clubSlug };
}

function useDraftRouteNavigationGuard(shouldBlock: boolean) {
  const blocker = useBlocker(shouldBlock);
  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }
    if (window.confirm("저장되지 않은 공개 기록 초안이 있습니다. 이 화면을 떠날까요?")) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);
}

function useHostSessionEditorActions(
  context: ReadmatesApiContext,
  onSessionRecordsChanged?: (sessionId: string) => void | Promise<void>,
): HostSessionEditorActions {
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
      await onSessionRecordsChanged?.(sessionId);
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
    onSessionRecordsChanged,
    updateAttendance,
    updateSession,
  ]);
}

export function NewHostSessionRoute({
  returnTarget,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
  onSessionRecordsChanged,
}: HostSessionEditorRouteProps) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => contextFromClubSlug(clubSlug), [clubSlug]);
  const queryClient = useQueryClient();
  const handleSessionRecordsChanged = useCallback(
    async (sessionId: string) => {
      await Promise.all([
        invalidateHostSessionRecordSurfaces(queryClient, sessionId, context),
        onSessionRecordsChanged?.({ sessionId, clubSlug }),
      ]);
    },
    [clubSlug, context, onSessionRecordsChanged, queryClient],
  );
  const actions = useHostSessionEditorActions(context, handleSessionRecordsChanged);
  return (
    <HostSessionEditor
      returnTarget={returnTarget}
      actions={actions}
      clubSlug={clubSlug}
      LinkComponent={LinkComponent}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
      onSessionRecordsChanged={handleSessionRecordsChanged}
    />
  );
}

export function EditHostSessionRoute({
  returnTarget,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
  onSessionRecordsChanged,
}: HostSessionEditorRouteProps) {
  const loaderData = useLoaderData() as HostSessionEditorRouteData;
  const { clubSlug, sessionId: routeSessionId } = useParams<{ clubSlug: string; sessionId: string }>();
  const sessionId = routeSessionId ?? loaderData.sessionId;
  const context = useMemo(() => contextFromClubSlug(clubSlug), [clubSlug]);
  const queryClient = useQueryClient();
  const handleSessionRecordsChanged = useCallback(
    async (changedSessionId: string) => {
      await Promise.all([
        invalidateHostSessionRecordSurfaces(queryClient, changedSessionId, context),
        onSessionRecordsChanged?.({ sessionId: changedSessionId, clubSlug }),
      ]);
    },
    [clubSlug, context, onSessionRecordsChanged, queryClient],
  );
  const actions = useHostSessionEditorActions(context, handleSessionRecordsChanged);
  const sessionQuery = useQuery(hostSessionDetailQuery(sessionId, context));
  const dispatchesQuery = useQuery(hostSessionManualDispatchesQuery(
    { sessionId, page: { limit: EDITOR_MANUAL_DISPATCH_PAGE_LIMIT } },
    context,
  ));
  const recordEditorQuery = useQuery(hostSessionRecordEditorQuery(sessionId, context));
  const historyQuery = useQuery(hostSessionRecordHistoryQuery(
    sessionId,
    { limit: EDITOR_HISTORY_PAGE_LIMIT },
    context,
  ));

  if (!sessionQuery.data || !recordEditorQuery.data) {
    return null;
  }

  return (
    <EditHostSessionRecordWorkflow
      session={sessionQuery.data}
      recordEditor={recordEditorQuery.data}
      history={historyQuery.data?.items ?? []}
      notificationDispatches={dispatchesQuery.data?.items ?? []}
      context={context}
      actions={actions}
      reloadRecordEditor={async () => (await recordEditorQuery.refetch()).data}
      returnTarget={returnTarget}
      clubSlug={clubSlug}
      LinkComponent={LinkComponent}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
      onSessionRecordsChanged={handleSessionRecordsChanged}
    />
  );
}

function EditHostSessionRecordWorkflow({
  session,
  recordEditor,
  history,
  notificationDispatches,
  context,
  actions,
  reloadRecordEditor,
  returnTarget,
  clubSlug,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
  onSessionRecordsChanged,
}: {
  session: HostSessionDetailResponse;
  recordEditor: HostSessionRecordEditor;
  history: HostSessionHistoryItem[];
  notificationDispatches: ManualNotificationDispatchListItem[];
  context: ReadmatesApiContext;
  actions: HostSessionEditorActions;
  reloadRecordEditor: () => Promise<HostSessionRecordEditor | undefined>;
  returnTarget?: ReadmatesReturnTarget;
  clubSlug?: string;
  LinkComponent?: HostSessionEditorLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
  onSessionRecordsChanged: (sessionId: string) => void | Promise<void>;
}) {
  const saveMutation = useSaveHostSessionRecordDraftMutation(context);
  const restoreMutation = useRestoreHostSessionRevisionToDraftMutation(context);
  const controller = useSessionRecordDraftController({
    editor: recordEditor,
    onSave: saveMutation.mutateAsync,
    onReload: reloadRecordEditor,
  });
  useDraftRouteNavigationGuard(controller.shouldBlockNavigation);

  return (
    <HostSessionEditor
      session={session}
      notificationDispatches={notificationDispatches}
      returnTarget={returnTarget}
      actions={actions}
      clubSlug={clubSlug}
      LinkComponent={LinkComponent}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
      onSessionRecordsChanged={onSessionRecordsChanged}
      recordWorkflow={{
        editor: recordEditor,
        history,
        snapshot: controller.snapshot,
        saveState: controller.saveState,
        expectedDraftRevision: controller.expectedDraftRevision,
        restoring: restoreMutation.isPending,
        onSnapshotChange: controller.updateSnapshot,
        onReloadDraft: controller.reloadDraft,
        onCopyInput: controller.copyInput,
        onRestore: async ({ revisionId, expectedDraftRevision }) => {
          const draft = await restoreMutation.mutateAsync({
            sessionId: recordEditor.sessionId,
            revisionId,
            request: { expectedDraftRevision },
          });
          controller.adoptEditor({
            ...recordEditor,
            draft,
            draftLiveBaseStale: draft.baseLiveRevision !== recordEditor.liveRevision,
          });
        },
      }}
    />
  );
}
