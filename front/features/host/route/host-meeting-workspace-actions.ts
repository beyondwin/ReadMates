import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import type { HostSessionEditorActions } from "./host-session-editor-actions";
import { hostSessionLifecycleResultFromResponse } from "./host-session-lifecycle-result";
import { hostSessionEditorPreviewActions } from "./host-session-editor-data";
import {
  hostSessionDeletionPreviewQuery,
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

export function useHostMeetingWorkspaceActions(
  context: ExplicitReadmatesApiContext,
  onSessionRecordsChanged?: (sessionId: string) => void | Promise<void>,
): HostSessionEditorActions {
  const queryClient = useQueryClient();
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

  const runLifecycle = useCallback(async (
    mutate: () => Promise<Response>,
    sessionId: string,
  ) => {
    const result = await hostSessionLifecycleResultFromResponse(await mutate(), {
      clubSlug: context.clubSlug,
      requestKind: "SESSION_LIFECYCLE",
    });
    if (result.ok) {
      await onSessionRecordsChanged?.(sessionId);
    }
    return result;
  }, [context.clubSlug, onSessionRecordsChanged]);

  return useMemo<HostSessionEditorActions>(() => ({
    loadDeletionPreview: (sessionId) =>
      queryClient.fetchQuery(hostSessionDeletionPreviewQuery(sessionId, context)),
    deleteSession: (sessionId) => deleteSession(sessionId),
    restoreSession: (sessionId) => restoreSession(sessionId),
    openSession: (sessionId) => runLifecycle(() => openSession(sessionId), sessionId),
    closeSession: (sessionId) => runLifecycle(() => closeSession(sessionId), sessionId),
    publishSession: (sessionId) => runLifecycle(() => publishSession(sessionId), sessionId),
    reopenSession: (sessionId, request) =>
      runLifecycle(() => reopenSession({ sessionId, request }), sessionId),
    unpublishSession: (sessionId, request) =>
      runLifecycle(() => unpublishSession({ sessionId, request }), sessionId),
    returnSessionToDraft: (sessionId, request) =>
      runLifecycle(() => returnSessionToDraft({ sessionId, request }), sessionId),
    saveSession: (sessionId, request) =>
      sessionId === null
        ? createSession(request)
        : updateSession({ sessionId, request }),
    updateAttendance: (sessionId, attendance) =>
      updateAttendance({ sessionId, attendance }),
    previewSessionImport: hostSessionEditorPreviewActions(context).previewSessionImport,
    commitSessionImport: async (sessionId, request) => {
      const result = await commitImport({ sessionId, request });
      await onSessionRecordsChanged?.(sessionId);
      return result;
    },
    saveSessionAccessScope: (sessionId, request) => saveAccessScope({ sessionId, request }),
  }), [
    closeSession,
    commitImport,
    context,
    createSession,
    deleteSession,
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
