import { useCallback, useEffect, useMemo, useState } from "react";
import { useBlocker, useLoaderData, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import HostSessionEditor, {
  type HostSessionEditorLinkComponent,
  type HostSessionRecordApplyReview,
} from "@/features/host/ui/host-session-editor";
import { appendUniqueSessionHistory } from "@/features/host/ui/session-editor/session-history-model";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";
import type {
  HostSessionHistoryItem,
  HostSessionHistoryPage,
  HostSessionRecordApplyRequest,
  HostSessionRecordEditor,
  SessionRecordSnapshot,
} from "@/features/host/api/host-session-record-contracts";
import type {
  HostSessionDetailResponse,
  ManualNotificationDispatchListItem,
} from "@/features/host/api/host-contracts";
import {
  hostNotificationKeys,
} from "@/features/host/queries/host-notification-queries";
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
import {
  HostNotificationComposerController,
  type HostNotificationComposerRequest,
} from "./host-notification-composer-controller";

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

function recordApplyChangedSections(
  live: SessionRecordSnapshot,
  draft: SessionRecordSnapshot,
) {
  const changed: string[] = [];
  if (live.visibility !== draft.visibility) {
    changed.push("공개 범위");
  }
  if (live.publicationSummary !== draft.publicationSummary) {
    changed.push("공개 요약");
  }
  if (JSON.stringify(live.highlights) !== JSON.stringify(draft.highlights)) {
    changed.push("하이라이트");
  }
  if (JSON.stringify(live.oneLineReviews) !== JSON.stringify(draft.oneLineReviews)) {
    changed.push("한줄평");
  }
  if (JSON.stringify(live.feedbackDocument) !== JSON.stringify(draft.feedbackDocument)) {
    changed.push("피드백 문서");
  }
  return changed;
}

function isFreshApplyRequired(code: string) {
  return [
    "SESSION_RECORD_DRAFT_STALE",
    "SESSION_RECORD_LIVE_STALE",
    "SESSION_RECORD_APPLY_REQUEST_ALREADY_USED",
    "SESSION_RECORD_INVALID_APPLY_CONTRACT",
  ].includes(code);
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
  const queryClient = useQueryClient();
  const saveMutation = useSaveHostSessionRecordDraftMutation(context);
  const restoreMutation = useRestoreHostSessionRevisionToDraftMutation(context);
  const previewMutation = usePreviewHostSessionRecordApplyMutation(context);
  const applyMutation = useApplyHostSessionRecordMutation(context, async (event) => {
    await onSessionRecordsChanged(event.sessionId);
  });
  const [applyPreview, setApplyPreview] = useState<HostSessionRecordApplyReview | null>(null);
  const [pendingApply, setPendingApply] = useState<{
    sessionId: string;
    request: HostSessionRecordApplyRequest;
  } | null>(null);
  const [composerRequest, setComposerRequest] =
    useState<HostNotificationComposerRequest | null>(null);
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
      const request = {
        applyRequestId: crypto.randomUUID(),
        expectedDraftRevision: controller.expectedDraftRevision,
        expectedLiveRevision: recordEditor.liveRevision,
        expectedDraftHash: preview.expectedDraftHash,
      };
      setPendingApply({
        sessionId: recordEditor.sessionId,
        request,
      });
      setApplyPreview({
        eventType: preview.eventType,
        changedSections: recordApplyChangedSections(
          recordEditor.liveSnapshot,
          controller.snapshot,
        ),
        liveRevision: recordEditor.liveRevision,
        nextLiveRevision: recordEditor.liveRevision + 1,
        draftRevision: controller.expectedDraftRevision,
      });
      setConfirmationOpen(true);
      return preview;
    } finally {
      setApplyPreviewRefreshing(false);
    }
  }, [
    controller.expectedDraftRevision,
    controller.snapshot,
    previewMutation,
    recordEditor.liveRevision,
    recordEditor.liveSnapshot,
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
    if (!applyPreview || !pendingApply) {
      return;
    }
    try {
      const result = await applyMutation.mutateAsync(pendingApply);
      setConfirmationOpen(false);
      setApplyPreview(null);
      setPendingApply(null);
      await controller.reloadDraft();
      if (result.composer) {
        queryClient.removeQueries({
          queryKey: hostNotificationKeys.manualOptionsRoot(context),
        });
        setComposerRequest({
          sessionId: result.composer.sessionId,
          eventType: result.composer.eventType,
          origin: "CONTENT_UPDATE",
        });
      }
      setConfirmationMessage({
        kind: "status",
        text: "변경사항을 반영했습니다. 알림은 작성기에서 별도로 선택해 주세요.",
      });
    } catch (error) {
      const code = apiErrorCode(error);
      if (isFreshApplyRequired(code)) {
        setConfirmationOpen(false);
        setApplyPreview(null);
        setPendingApply(null);
        await controller.reloadDraft();
        setConfirmationMessage({
          kind: "alert",
          text: "기록 상태가 변경되었습니다. 최신 초안을 확인한 뒤 새 반영 요청을 만들어 주세요.",
        });
        return;
      }
      if (!code) {
        setConfirmationMessage({
          kind: "alert",
          text: "처리 결과를 확인하지 못했습니다. 같은 반영 요청으로 다시 확인해 주세요.",
        });
        return;
      }
      setConfirmationOpen(false);
      setApplyPreview(null);
      setPendingApply(null);
      setConfirmationMessage({
        kind: "alert",
        text: "변경사항을 반영하지 못했습니다. live 기록은 변경되지 않았습니다.",
      });
    }
  }, [
    applyMutation,
    applyPreview,
    context,
    controller,
    pendingApply,
    queryClient,
  ]);

  return (
    <>
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
            submitting: applyPreviewRefreshing || previewMutation.isPending || applyMutation.isPending,
            message: confirmationMessage,
            onReview: reviewDraft,
            onCancel: () => {
              setConfirmationOpen(false);
              setApplyPreview(null);
              setPendingApply(null);
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
      <HostNotificationComposerController
        request={composerRequest}
        context={context}
        onClose={() => setComposerRequest(null)}
      />
    </>
  );
}
