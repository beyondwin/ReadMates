import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useBlocker,
  useLoaderData,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
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
  buildHostSessionEditorUrl,
  parseHostSessionEditorLocation,
  type HostSessionEditorLocation,
} from "@/features/host/model/host-session-editor-navigation";
import {
  hostNotificationKeys,
} from "@/features/host/queries/host-notification-queries";
import {
  hostSessionRecordEditorQuery,
  hostSessionRecordHistoryQuery,
  hostSessionRecordKeys,
  useApplyHostSessionRecordMutation,
  usePreviewHostSessionRecordApplyMutation,
  useRebaseHostSessionRecordDraftMutation,
  useRestoreHostSessionRevisionToDraftMutation,
  useSaveHostSessionRecordDraftMutation,
} from "@/features/host/queries/host-session-record-queries";
import { useSessionRecordDraftController } from "@/features/host/hooks/use-session-record-draft-controller";
import {
  hostSessionDeletionPreviewQuery,
  hostSessionDetailQuery,
  hostSessionKeys,
  invalidateHostSessionManualDispatches,
  invalidateHostSessionRecordSurfaces,
  hostSessionManualDispatchesQuery,
  useCloseHostSessionMutation,
  useCommitHostSessionImportMutation,
  useCreateHostSessionMutation,
  useDeleteHostSessionMutation,
  usePublishHostSessionMutation,
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

function useHostSessionEditorLocation(): {
  location: HostSessionEditorLocation;
  replaceLocation: (next: HostSessionEditorLocation) => void;
} {
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const currentUrl =
    `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`;
  const currentUrlRef = useRef(currentUrl);
  const canonicalizedSourceUrlRef = useRef<string | null>(null);
  const location = useMemo(
    () => parseHostSessionEditorLocation(routerLocation.search),
    [routerLocation.search],
  );
  const replaceLocation = useCallback((next: HostSessionEditorLocation) => {
    const nextUrl = buildHostSessionEditorUrl(currentUrlRef.current, next);
    if (nextUrl === currentUrlRef.current) {
      return;
    }
    currentUrlRef.current = nextUrl;
    void navigate(nextUrl, {
      replace: true,
      state: routerLocation.state,
    });
  }, [navigate, routerLocation.state]);

  useEffect(() => {
    const canonicalUrl = buildHostSessionEditorUrl(currentUrl, location);
    if (canonicalUrl === currentUrl) {
      currentUrlRef.current = currentUrl;
      canonicalizedSourceUrlRef.current = null;
      return;
    }
    currentUrlRef.current = canonicalUrl;
    if (canonicalizedSourceUrlRef.current === currentUrl) {
      return;
    }
    canonicalizedSourceUrlRef.current = currentUrl;
    void navigate(canonicalUrl, {
      replace: true,
      state: routerLocation.state,
    });
  }, [currentUrl, location, navigate, routerLocation.state]);

  return useMemo(
    () => ({ location, replaceLocation }),
    [location, replaceLocation],
  );
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
  const blocker = useBlocker(useCallback(
    ({ currentLocation, nextLocation }) =>
      shouldBlock && currentLocation.pathname !== nextLocation.pathname,
    [shouldBlock],
  ));
  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }
    if (window.confirm("저장되지 않은 작업 초안이 있습니다. 이 화면을 떠날까요?")) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);
}

function HostSessionEditorQueryState({
  status,
  onRetry,
}: {
  status: "loading" | "error";
  onRetry?: () => void;
}) {
  return (
    <main className="rm-host-session-editor">
      <section className="page-header-compact">
        <div className="container">
          <div className="eyebrow">세션 운영 문서</div>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            세션 문서 편집
          </h1>
        </div>
      </section>
      <section>
        <div className="container">
          {status === "loading" ? (
            <div className="surface-quiet small" role="status" style={{ padding: 18 }}>
              세션 기록 편집 정보를 불러오는 중입니다.
            </div>
          ) : (
            <div className="surface-quiet stack" role="alert" style={{ padding: 18 }}>
              <p className="small" style={{ margin: 0 }}>
                세션 기록 편집 정보를 불러오지 못했습니다.
              </p>
              {onRetry ? (
                <div>
                  <button className="btn btn-quiet btn-sm" type="button" onClick={onRetry}>
                    다시 시도
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </main>
  );
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
  const { location, replaceLocation } = useHostSessionEditorLocation();
  const navigation = useMemo(
    () => ({ location, onChange: replaceLocation }),
    [location, replaceLocation],
  );
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
      navigation={navigation}
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
  const { location, replaceLocation } = useHostSessionEditorLocation();
  const navigation = useMemo(
    () => ({ location, onChange: replaceLocation }),
    [location, replaceLocation],
  );
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
    if (sessionQuery.isError || recordEditorQuery.isError) {
      return (
        <HostSessionEditorQueryState
          status="error"
          onRetry={() => {
            void Promise.all([
              sessionQuery.refetch(),
              recordEditorQuery.refetch(),
            ]);
          }}
        />
      );
    }
    return <HostSessionEditorQueryState status="loading" />;
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
      navigation={navigation}
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
  navigation = {
    location: { section: "overview", source: "manual" },
    onChange: () => undefined,
  },
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
  navigation?: {
    location: HostSessionEditorLocation;
    onChange: (next: HostSessionEditorLocation) => void;
  };
}) {
  const queryClient = useQueryClient();
  const saveMutation = useSaveHostSessionRecordDraftMutation(context);
  const rebaseMutation = useRebaseHostSessionRecordDraftMutation(context);
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
  const [rebaseError, setRebaseError] = useState<string | null>(null);
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

  const onApplyCompleted = useCallback(async () => {
    await Promise.all([
      controller.reloadDraft(),
      queryClient.invalidateQueries({
        queryKey: hostSessionRecordKeys.historyRoot(recordEditor.sessionId, context),
      }),
      queryClient.invalidateQueries({
        queryKey: hostSessionKeys.detail(recordEditor.sessionId, context),
      }),
    ]);
    navigation.onChange({ section: "overview", source: "manual" });
  }, [context, controller, navigation, queryClient, recordEditor.sessionId]);

  const rebaseDraft = useCallback(async () => {
    if (controller.expectedDraftRevision === null) {
      setRebaseError("먼저 작업 초안을 저장해 주세요.");
      return;
    }
    setRebaseError(null);
    try {
      const draft = await rebaseMutation.mutateAsync({
        sessionId: recordEditor.sessionId,
        request: {
          expectedDraftRevision: controller.expectedDraftRevision,
          expectedLiveRevision: recordEditor.liveRevision,
          expectedSessionUpdatedAt: recordEditor.liveSessionUpdatedAt,
        },
      });
      try {
        const latest = await reloadRecordEditor();
        if (latest) {
          controller.adoptEditor(latest);
          if (latest.draftLiveBaseStale) {
            setRebaseError(
              "재확인 중 세션이 다시 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.",
            );
          }
        } else {
          controller.adoptDraftRevision(draft.draftRevision);
        }
      } catch {
        controller.adoptDraftRevision(draft.draftRevision);
      }
    } catch (error) {
      try {
        const latest = await reloadRecordEditor();
        if (latest) {
          controller.adoptEditor(latest);
        }
      } catch {
        // Keep the current saved draft visible and leave the retry action available.
      }
      const code = apiErrorCode(error);
      setRebaseError(
        code === "SESSION_RECORD_DRAFT_STALE" || code === "SESSION_RECORD_LIVE_STALE"
          ? "세션 또는 초안이 다시 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요."
          : "재확인 결과를 확인하지 못했습니다. 최신 상태를 불러온 뒤 다시 시도해 주세요.",
      );
    }
  }, [controller, rebaseMutation, recordEditor, reloadRecordEditor]);

  const requestApplyPreview = useCallback(async () => {
    if (controller.expectedDraftRevision === null) {
      setConfirmationMessage({ kind: "alert", text: "먼저 작업 초안을 저장해 주세요." });
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
        visibility: controller.snapshot.visibility,
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
      await onApplyCompleted();
      if (result.composer) {
        queryClient.removeQueries({
          queryKey: hostNotificationKeys.manualOptionsRoot(context),
        });
        setComposerRequest({
          sessionId: result.composer.sessionId,
          eventType: result.composer.eventType,
          contentRevision: result.composer.contentRevision,
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
        text: "변경사항을 반영하지 못했습니다. 현재 적용본은 바뀌지 않았습니다.",
      });
    }
  }, [
    applyMutation,
    applyPreview,
    context,
    controller,
    onApplyCompleted,
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
        navigation={navigation}
        recordWorkflow={{
          editor: recordEditor,
          history: effectiveHistory.items,
          historyNextCursor: effectiveHistory.nextCursor,
          historyLoadingMore,
          snapshot: controller.snapshot,
          saveState: controller.saveState,
          expectedDraftRevision: controller.expectedDraftRevision,
          restoring: restoreMutation.isPending,
          rebasePending: rebaseMutation.isPending,
          rebaseError,
          onSnapshotChange: controller.updateSnapshot,
          onReloadDraft: controller.reloadDraft,
          onRebaseDraft: rebaseDraft,
          onDraftCommitted: async ({ draftRevision }) => {
            controller.adoptDraftRevision(draftRevision);
            await controller.reloadDraft();
            navigation.onChange({ section: "records", source: "manual" });
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
          onRestoreCompleted: () => {
            navigation.onChange({ section: "records", source: "manual" });
          },
        }}
      />
      <HostNotificationComposerController
        request={composerRequest}
        context={context}
        onClose={() => setComposerRequest(null)}
        onConfirmed={() => {
          void invalidateHostSessionManualDispatches(queryClient, context);
        }}
      />
    </>
  );
}
