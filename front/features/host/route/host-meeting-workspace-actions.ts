import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import {
  readCreatedHostSessionId,
  type HostSessionEditorActions,
} from "./host-session-editor-actions";
import { hostSessionLifecycleResultFromResponse } from "./host-session-lifecycle-result";
import { hostSessionEditorPreviewActions } from "./host-session-editor-data";
import {
  hostSessionDeletionPreviewQuery,
  publishDeletedHostSession,
  publishHostSessionAttendance,
  publishHostSessionCreated,
  publishHostSessionImport,
  publishHostSessionResponse,
  publishHostSessionVisibility,
  publishRestoredHostSession,
  useCloseHostSessionMutation,
  useCommitHostSessionImportMutation,
  useCreateHostSessionMutation,
  useDeleteHostSessionMutation,
  useOpenHostSessionMutation,
  usePublishHostSessionMutation,
  useReopenHostSessionMutation,
  useRestoreHostSessionMutation,
  useReturnHostSessionToDraftMutation,
  useSaveHostSessionAccessScopeMutation,
  useUnpublishHostSessionMutation,
  useUpdateHostSessionAttendanceMutation,
  useUpdateHostSessionMutation,
} from "@/features/host/queries/host-session-queries";
import { publishTransitionAction, TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";

export function useHostMeetingWorkspaceActions(
  context: ExplicitReadmatesApiContext,
  onSessionRecordsChanged?: (sessionId: string) => void | Promise<void>,
): HostSessionEditorActions {
  const queryClient = useQueryClient();
  const transitionOwner = useTransitionSafetyOwner("host-meeting-workspace-actions");
  const { mutateAsync: createSession } = useCreateHostSessionMutation(context);
  const { mutateAsync: updateSession } = useUpdateHostSessionMutation(context);
  const { mutateAsync: deleteSession } = useDeleteHostSessionMutation(context);
  const { mutateAsync: restoreSession } = useRestoreHostSessionMutation(context);
  const { mutateAsync: openSession } = useOpenHostSessionMutation(context);
  const { mutateAsync: closeSession } = useCloseHostSessionMutation(context);
  const { mutateAsync: publishSession } = usePublishHostSessionMutation(context);
  const { mutateAsync: reopenSession } = useReopenHostSessionMutation(context);
  const { mutateAsync: unpublishSession } = useUnpublishHostSessionMutation(context);
  const { mutateAsync: returnSessionToDraft } = useReturnHostSessionToDraftMutation(context);
  const { mutateAsync: updateAttendance } = useUpdateHostSessionAttendanceMutation(context);
  const { mutateAsync: commitImport } = useCommitHostSessionImportMutation(context);
  const { mutateAsync: saveAccessScope } = useSaveHostSessionAccessScopeMutation(context);

  const executeAccepted = useCallback(async <T,>(
    operationId: string,
    request: () => Promise<T>,
    publish: (
      result: T,
      publishAction: typeof publishTransitionAction,
      handle: Parameters<typeof publishTransitionAction>[0],
    ) => Promise<unknown>,
  ) => {
    const handle = transitionOwner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const result = await request();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      await publish(result, publishTransitionAction, handle);
      return result;
    } catch (error) {
      if (!(error instanceof TransitionOwnerObsoleteError)) await handle.settle("failed");
      throw error;
    } finally {
      handle.completePublication();
    }
  }, [transitionOwner]);

  const runLifecycle = useCallback(async (
    mutate: () => Promise<Response>,
    sessionId: string,
    operation: string,
    manualDispatches = true,
  ) => {
    const accepted = await executeAccepted(
      `host-session:${operation}:${sessionId}`,
      async () => {
        const response = await mutate();
        const result = await hostSessionLifecycleResultFromResponse(response, {
          clubSlug: context.clubSlug,
          requestKind: "SESSION_LIFECYCLE",
        });
        return { response, result };
      },
      async ({ response, result }, publishAction, handle) => {
        await publishAction(handle, "cache", () => publishHostSessionResponse(
          queryClient, response, sessionId, context, manualDispatches,
        ));
        if (result.ok && onSessionRecordsChanged) {
          await publishAction(handle, "receiptCallback", () => onSessionRecordsChanged(sessionId));
        }
      },
    );
    return accepted.result;
  }, [context, executeAccepted, onSessionRecordsChanged, queryClient]);

  return useMemo<HostSessionEditorActions>(() => ({
    loadDeletionPreview: (sessionId) =>
      queryClient.fetchQuery(hostSessionDeletionPreviewQuery(sessionId, context)),
    deleteSession: (sessionId) => executeAccepted(`host-session:delete:${sessionId}`, () => deleteSession(sessionId), (result, publish, handle) => publish(handle, "cache", () => publishDeletedHostSession(queryClient, result, sessionId, context))),
    restoreSession: (sessionId) => executeAccepted(`host-session:restore:${sessionId}`, () => restoreSession(sessionId), (result, publish, handle) => publish(handle, "cache", () => publishRestoredHostSession(queryClient, result, sessionId, context))),
    openSession: (sessionId) => runLifecycle(() => openSession(sessionId), sessionId, "open", false),
    closeSession: (sessionId) => runLifecycle(() => closeSession(sessionId), sessionId, "close"),
    publishSession: (sessionId) => runLifecycle(() => publishSession(sessionId), sessionId, "publish"),
    reopenSession: (sessionId, request) =>
      runLifecycle(() => reopenSession({ sessionId, request }), sessionId, "reopen"),
    unpublishSession: (sessionId, request) =>
      runLifecycle(() => unpublishSession({ sessionId, request }), sessionId, "unpublish"),
    returnSessionToDraft: (sessionId, request) =>
      runLifecycle(() => returnSessionToDraft({ sessionId, request }), sessionId, "return-to-draft"),
    saveSession: (sessionId, request) =>
      sessionId === null
        ? executeAccepted("host-session:create", () => createSession(request), (response, publish, handle) => publish(handle, "cache", () => publishHostSessionCreated(queryClient, response, context)))
        : executeAccepted(`host-session:update:${sessionId}`, () => updateSession({ sessionId, request }), (response, publish, handle) => publish(handle, "cache", () => publishHostSessionResponse(queryClient, response, sessionId, context))),
    readCreatedSessionId: readCreatedHostSessionId,
    updateAttendance: (sessionId, attendance) =>
      executeAccepted(`host-session:attendance:${sessionId}`, () => updateAttendance({ sessionId, attendance }), (_result, publish, handle) => publish(handle, "cache", () => publishHostSessionAttendance(queryClient, sessionId, attendance, context))),
    previewSessionImport: hostSessionEditorPreviewActions(context).previewSessionImport,
    commitSessionImport: async (sessionId, request) => {
      return executeAccepted(
        `host-session:import:${sessionId}`,
        () => commitImport({ sessionId, request }),
        async (_result, publish, handle) => {
          await publish(handle, "cache", () => publishHostSessionImport(queryClient, sessionId, context));
          if (onSessionRecordsChanged) {
            await publish(handle, "receiptCallback", () => onSessionRecordsChanged(sessionId));
          }
        },
      );
    },
    saveSessionAccessScope: (sessionId, request) => executeAccepted(`host-session:access:${sessionId}`, () => saveAccessScope({ sessionId, request }), (result, publish, handle) => publish(handle, "cache", () => publishHostSessionVisibility(queryClient, result, sessionId, context))),
  }), [
    closeSession,
    commitImport,
    context,
    createSession,
    deleteSession,
    executeAccepted,
    restoreSession,
    openSession,
    publishSession,
    queryClient,
    onSessionRecordsChanged,
    reopenSession,
    returnSessionToDraft,
    saveAccessScope,
    runLifecycle,
    unpublishSession,
    updateAttendance,
    updateSession,
  ]);
}
