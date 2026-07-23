import { useCallback, useEffect, useMemo, useState } from "react";
import { useBlocker, useLoaderData, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import HostSessionEditor, { type HostSessionEditorLinkComponent } from "@/features/host/ui/host-session-editor";
import { appendUniqueSessionHistory } from "@/features/host/ui/session-editor/session-history-model";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";
import { invalidateHostNotifications } from "@/features/host/queries/host-notification-queries";
import type {
  HostSessionHistoryItem,
  HostSessionHistoryPage,
  HostSessionRecordApplyPreview,
  HostSessionRecordEditor,
  NotificationDecision,
} from "@/features/host/api/host-session-record-contracts";
import type {
  HostSessionDetailResponse,
  ManualNotificationDispatchListItem,
} from "@/features/host/api/host-contracts";
import {
  hostSessionRecordEditorQuery,
  hostSessionRecordHistoryQuery,
  useApplyHostSessionRecordMutation,
  usePreviewHostSessionRecordApplyMutation,
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

function apiErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
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
      historyPage={historyQuery.data ?? { items: [], nextCursor: null }}
      loadHistoryPage={(cursor) => queryClient.fetchQuery(hostSessionRecordHistoryQuery(
        sessionId,
        { limit: EDITOR_HISTORY_PAGE_LIMIT, cursor },
        context,
      ))}
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

export function EditHostSessionRecordWorkflow({
  session,
  recordEditor,
  historyPage,
  loadHistoryPage,
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
  historyPage: HostSessionHistoryPage;
  loadHistoryPage: (cursor: string) => Promise<HostSessionHistoryPage>;
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
  const previewMutation = usePreviewHostSessionRecordApplyMutation(context);
  const applyMutation = useApplyHostSessionRecordMutation(context, async (event) => {
    await onSessionRecordsChanged(event.sessionId);
  });
  const [applyPreview, setApplyPreview] = useState<HostSessionRecordApplyPreview | null>(null);
  const [notificationDecision, setNotificationDecision] = useState<NotificationDecision | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [applyPreviewRefreshing, setApplyPreviewRefreshing] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState<null | {
    kind: "alert" | "status";
    text: string;
  }>(null);
  const [historyState, setHistoryState] = useState<{
    firstPage: HostSessionHistoryPage;
    items: HostSessionHistoryItem[];
    nextCursor: string | null;
  }>({
    firstPage: historyPage,
    items: historyPage.items,
    nextCursor: historyPage.nextCursor,
  });
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const effectiveHistory = historyState.firstPage === historyPage
    ? historyState
    : {
        firstPage: historyPage,
        items: historyPage.items,
        nextCursor: historyPage.nextCursor,
      };
  const controller = useSessionRecordDraftController({
    editor: recordEditor,
    onSave: saveMutation.mutateAsync,
    onReload: reloadRecordEditor,
  });
  useDraftRouteNavigationGuard(controller.shouldBlockNavigation);

  const requestApplyPreview = useCallback(async () => {
    if (controller.expectedDraftRevision === null) {
      setConfirmationMessage({ kind: "alert", text: "먼저 공개 기록 초안을 저장해 주세요." });
      return null;
    }
    setApplyPreviewRefreshing(true);
    try {
      const preview = await previewMutation.mutateAsync({
        sessionId: recordEditor.sessionId,
        request: {
          expectedDraftRevision: controller.expectedDraftRevision,
          expectedLiveRevision: recordEditor.liveRevision,
        },
      });
      setApplyPreview(preview);
      setNotificationDecision(null);
      setConfirmationOpen(true);
      return preview;
    } finally {
      setApplyPreviewRefreshing(false);
    }
  }, [
    controller.expectedDraftRevision,
    previewMutation,
    recordEditor.liveRevision,
    recordEditor.sessionId,
  ]);

  const reviewDraft = useCallback(async () => {
    setConfirmationMessage(null);
    try {
      await requestApplyPreview();
    } catch {
      setConfirmationMessage({
        kind: "alert",
        text: "반영 미리보기를 만들지 못했습니다. 초안 상태를 확인한 뒤 다시 시도해 주세요.",
      });
    }
  }, [requestApplyPreview]);

  const confirmApply = useCallback(async () => {
    if (
      !applyPreview ||
      notificationDecision === null ||
      controller.expectedDraftRevision === null
    ) {
      return;
    }
    try {
      const result = await applyMutation.mutateAsync({
        sessionId: recordEditor.sessionId,
        request: {
          previewId: applyPreview.previewId,
          expectedDraftRevision: controller.expectedDraftRevision,
          expectedLiveRevision: recordEditor.liveRevision,
          notificationDecision,
        },
      });
      setConfirmationOpen(false);
      setApplyPreview(null);
      setNotificationDecision(null);
      await controller.reloadDraft();
      setConfirmationMessage({
        kind: "status",
        text: result.notificationDecision === "SEND"
          ? "변경사항을 반영했습니다. 알림 발송 장부에서 확인해 주세요."
          : "알림 없이 변경사항을 반영했습니다.",
      });
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === "NOTIFICATION_PREVIEW_EXPIRED" || code === "NOTIFICATION_TARGETS_CHANGED") {
        try {
          await requestApplyPreview();
          setConfirmationMessage({
            kind: "alert",
            text: "알림 대상이 변경되어 미리보기를 갱신했습니다. SEND 또는 SKIP을 다시 선택해 주세요.",
          });
        } catch {
          setConfirmationOpen(false);
          setApplyPreview(null);
          setNotificationDecision(null);
          setConfirmationMessage({
            kind: "alert",
            text: "미리보기를 갱신하지 못했습니다. 변경사항은 반영되지 않았습니다.",
          });
        }
        return;
      }
      if (!code) {
        setConfirmationMessage({
          kind: "alert",
          text: "처리 결과를 확인하지 못했습니다. 같은 SEND 또는 SKIP 선택으로 다시 확인해 주세요.",
        });
        return;
      }
      setConfirmationOpen(false);
      setApplyPreview(null);
      setNotificationDecision(null);
      setConfirmationMessage({
        kind: "alert",
        text: code === "NOTIFICATION_PREVIEW_ALREADY_CONSUMED"
          ? "이미 처리된 미리보기입니다. 최신 기록을 다시 불러와 결과를 확인해 주세요."
          : "변경사항을 반영하지 못했습니다. live 기록은 변경되지 않았습니다.",
      });
    }
  }, [
    applyMutation,
    applyPreview,
    controller,
    notificationDecision,
    recordEditor.liveRevision,
    recordEditor.sessionId,
    requestApplyPreview,
  ]);

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
        history: effectiveHistory.items,
        historyNextCursor: effectiveHistory.nextCursor,
        historyLoadingMore,
        snapshot: controller.snapshot,
        saveState: controller.saveState,
        expectedDraftRevision: controller.expectedDraftRevision,
        restoring: restoreMutation.isPending,
        onSnapshotChange: controller.updateSnapshot,
        onReloadDraft: controller.reloadDraft,
        onDraftCommitted: async ({ draftRevision }) => {
          controller.adoptDraftRevision(draftRevision);
          await controller.reloadDraft();
        },
        onLoadMoreHistory: async (cursor) => {
          setHistoryLoadingMore(true);
          try {
            const nextPage = await loadHistoryPage(cursor);
            setHistoryState({
              firstPage: historyPage,
              items: appendUniqueSessionHistory(effectiveHistory.items, nextPage.items),
              nextCursor: nextPage.nextCursor,
            });
          } finally {
            setHistoryLoadingMore(false);
          }
        },
        onCopyInput: controller.copyInput,
        confirmation: {
          open: confirmationOpen,
          preview: applyPreview,
          decision: notificationDecision,
          submitting: applyPreviewRefreshing || previewMutation.isPending || applyMutation.isPending,
          message: confirmationMessage,
          onReview: reviewDraft,
          onDecisionChange: setNotificationDecision,
          onCancel: () => {
            setConfirmationOpen(false);
            setApplyPreview(null);
            setNotificationDecision(null);
          },
          onConfirm: confirmApply,
        },
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
