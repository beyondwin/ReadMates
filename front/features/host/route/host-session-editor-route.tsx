import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useBlocker,
  useLoaderData,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import HostSessionEditor, {
  type HostSessionEditorLinkComponent,
  type HostSessionRecordApplyReview,
} from "@/features/host/ui/host-session-editor";
import { appendUniqueSessionHistory } from "@/features/host/ui/session-editor/session-history-model";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { ReadmatesApiContext } from "@/shared/api/client";
import { recordHostScheduleDefaults } from "@/shared/observability/frontend-observability";
import {
  wrapHostSessionEditorActionsForUndo,
  type HostSessionEditorActions,
} from "@/features/host/route/host-session-editor-actions";
import type {
  HostSessionChangeReceipt,
  HostSessionRestorePreview,
} from "@/features/host/api/host-session-recovery-contracts";
import type {
  HostSessionHistoryItem,
  HostSessionHistoryPage,
  HostSessionRecordApplyRequest,
  HostSessionRecordEditor,
  SessionRecordSnapshot,
} from "@/features/host/api/host-session-record-contracts";
import type {
  HostSessionDetailResponse,
  HostSessionTrashItem,
  ManualNotificationDispatchListItem,
} from "@/features/host/api/host-contracts";
import { hostMeetingHref } from "@/features/host/model/host-meeting-ledger-model";
import {
  hostSessionTrashDeletedAtLabel,
  hostSessionTrashRemainingCopy,
} from "@/features/host/model/host-session-ledger-model";
import { openAlreadyExistsMessage } from "@/features/host/model/host-session-lifecycle-model";
import { isReadmatesApiError } from "@/shared/api/errors";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import {
  WorkspaceTrashTombstone,
  type WorkspaceTrashRestoreConflict,
} from "@/features/host/ui/session-workspace/workspace-trash-tombstone";
import {
  buildHostSessionWorkspaceUrl,
  parseHostSessionWorkspaceLocation,
  type HostSessionWorkspaceLocation,
  type HostSessionWorkspacePanel,
} from "@/features/host/model/host-session-workspace-navigation";
import {
  buildHostSessionRestorePreviewItemView,
  hasAppliedSessionRecord,
  hostSessionChangeUndoDescription,
  hostSessionRestoreBlockedExplanation,
  hostSessionRestoreStaleExplanation,
} from "@/features/host/model/host-session-editor-view-model";
import {
  reverseLifecycleAction,
  type HostSessionReverseRequest,
} from "@/features/host/model/host-session-lifecycle-model";
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
  hostSessionRestorePreviewQuery,
  useRestoreHostSessionChangeMutation,
} from "@/features/host/queries/host-session-recovery-queries";
import {
  hostSessionDeletionPreviewQuery,
  hostSessionDetailQuery,
  hostSessionKeys,
  hostSessionTrashDetailQuery,
  isHostSessionNotFoundError,
  isHostSessionTrashExpiredError,
  classifyScheduleDefaultsError,
  hostSessionScheduleDefaultsQuery,
  invalidateHostSessionManualDispatches,
  invalidateHostSessionRecordSurfaces,
  hostSessionManualDispatchesQuery,
  resolveHostScheduleDefaultsLoadState,
  useCloseHostSessionMutation,
  useCommitHostSessionImportMutation,
  useCreateHostSessionMutation,
  useDeleteHostSessionMutation,
  useOpenHostSessionMutation,
  useRestoreHostSessionMutation,
  usePublishHostSessionMutation,
  useReopenHostSessionMutation,
  useReturnHostSessionToDraftMutation,
  useUnpublishHostSessionMutation,
  useUpdateHostSessionAttendanceMutation,
  useUpdateHostSessionMutation,
  useSaveHostSessionAccessScopeMutation,
} from "@/features/host/queries/host-session-queries";
import {
  hostSessionEditorPreviewActions,
  type HostSessionEditorRouteData,
} from "./host-session-editor-data";
import { hostSessionLifecycleResultFromResponse } from "./host-session-lifecycle-result";
import {
  HostNotificationComposerController,
  type HostNotificationComposerRequest,
} from "./host-notification-composer-controller";

const EDITOR_MANUAL_DISPATCH_PAGE_LIMIT = 20;
const EDITOR_HISTORY_PAGE_LIMIT = 30;

function useRecordHostScheduleDefaultsOutcome(query: {
  isPending: boolean;
  isFetching: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown;
}) {
  const inFlightRef = useRef(false);
  useEffect(() => {
    if (query.isPending || query.isFetching) {
      inFlightRef.current = true;
      return;
    }
    if (!inFlightRef.current || (!query.isSuccess && !query.isError)) {
      return;
    }
    inFlightRef.current = false;
    const outcome = query.isSuccess
      ? "success"
      : classifyScheduleDefaultsError(query.error).kind === "legacy-404"
        ? "legacy_404"
        : "error";
    recordHostScheduleDefaults({ outcome });
  }, [query.error, query.isError, query.isFetching, query.isPending, query.isSuccess]);
}

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

function isOverlayPanel(
  panel: HostSessionWorkspacePanel,
  homePanel: HostSessionWorkspacePanel,
) {
  if (panel === homePanel) {
    return false;
  }
  return panel === "basic" || panel === "history";
}

function useHostSessionEditorLocation(options?: {
  homePanel?: HostSessionWorkspacePanel;
}): {
  location: HostSessionWorkspaceLocation;
  replaceLocation: (next: HostSessionWorkspaceLocation) => void;
} {
  const homePanel = options?.homePanel ?? "focus";
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const currentUrl =
    `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`;
  const currentUrlRef = useRef(currentUrl);
  const canonicalizedSourceUrlRef = useRef<string | null>(null);
  const overlayPushedRef = useRef(false);
  const parsedLocation = useMemo(
    () => parseHostSessionWorkspaceLocation(routerLocation.search),
    [routerLocation.search],
  );
  const location = useMemo((): HostSessionWorkspaceLocation => {
    if (homePanel === "basic" && parsedLocation.panel === "focus") {
      return { panel: "basic", source: "manual" };
    }
    return parsedLocation;
  }, [homePanel, parsedLocation]);
  const replaceLocation = useCallback((next: HostSessionWorkspaceLocation) => {
    const nextUrl = buildHostSessionWorkspaceUrl(currentUrlRef.current, next);
    if (nextUrl === currentUrlRef.current) {
      return;
    }
    const openingOverlay = isOverlayPanel(next.panel, homePanel)
      && !isOverlayPanel(location.panel, homePanel);
    const closingOverlay = !isOverlayPanel(next.panel, homePanel)
      && isOverlayPanel(location.panel, homePanel);

    if (closingOverlay && overlayPushedRef.current) {
      overlayPushedRef.current = false;
      void navigate(-1);
      return;
    }

    overlayPushedRef.current = openingOverlay;
    currentUrlRef.current = nextUrl;
    void navigate(nextUrl, {
      replace: !openingOverlay,
      state: routerLocation.state,
    });
  }, [homePanel, location.panel, navigate, routerLocation.state]);

  useEffect(() => {
    if (!isOverlayPanel(location.panel, homePanel)) {
      overlayPushedRef.current = false;
    }
  }, [homePanel, location.panel]);

  useEffect(() => {
    const canonicalUrl = buildHostSessionWorkspaceUrl(currentUrl, location);
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
  hideTitle = false,
}: {
  status: "loading" | "error";
  onRetry?: () => void;
  hideTitle?: boolean;
}) {
  return (
    <main className="rm-host-session-editor">
      {hideTitle ? null : (
        <section className="page-header-compact">
          <div className="container">
            <div className="eyebrow">세션 운영 문서</div>
            <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
              세션 문서 편집
            </h1>
          </div>
        </section>
      )}
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

function HostSessionTrashTombstoneRoute({
  sessionId,
  clubSlug,
  trash,
  expired,
  restoreSession,
  LinkComponent,
  onRestored,
}: {
  sessionId: string;
  clubSlug?: string;
  trash: HostSessionTrashItem | null;
  expired: boolean;
  restoreSession: (sessionId: string) => Promise<HostSessionDetailResponse>;
  LinkComponent?: HostSessionEditorLinkComponent;
  onRestored: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [restoreDisabled, setRestoreDisabled] = useState(expired);
  const [restoreDisabledReason, setRestoreDisabledReason] = useState<string | null>(
    expired ? "복원 기간이 지났습니다." : null,
  );
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreConflict, setRestoreConflict] = useState<WorkspaceTrashRestoreConflict | null>(null);

  const openSessionHref = (openSessionId: string) => {
    const href = hostMeetingHref(openSessionId);
    return clubSlug
      ? scopedAppLinkTarget(`/clubs/${encodeURIComponent(clubSlug)}/app`, href)
      : href;
  };

  const runRestore = async () => {
    if (restoreDisabled || restoring) {
      return;
    }
    setRestoring(true);
    setRestoreError(null);
    setRestoreConflict(null);
    try {
      await restoreSession(sessionId);
      setRestoreSuccess(true);
      headingRef.current?.focus();
      onRestored();
      queueMicrotask(() => {
        document.querySelector<HTMLElement>(".rm-host-session-workspace__title")?.focus();
      });
    } catch (error) {
      if (isHostSessionTrashExpiredError(error)) {
        setRestoreDisabled(true);
        setRestoreDisabledReason("복원 기간이 지났습니다.");
        return;
      }
      if (isReadmatesApiError(error) && error.code === "SESSION_OPEN_ALREADY_EXISTS" && error.openSessionId) {
        setRestoreConflict({
          openSessionHref: openSessionHref(error.openSessionId),
          message: openAlreadyExistsMessage(),
        });
        return;
      }
      setRestoreError("모임을 복원하지 못했습니다.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <WorkspaceTrashTombstone
      sessionId={sessionId}
      sessionNumber={trash?.sessionNumber ?? 0}
      title={trash?.title ?? "모임"}
      deletedAtLabel={trash ? hostSessionTrashDeletedAtLabel(trash.deletedAt) : "삭제 시각을 확인할 수 없습니다."}
      remainingCopy={trash ? hostSessionTrashRemainingCopy(trash.purgeAfter) : "복원 기간이 지났습니다."}
      restoreDisabled={restoreDisabled}
      restoreDisabledReason={restoreDisabledReason}
      restoreError={restoreError}
      restoreConflict={restoreConflict}
      restoring={restoring}
      restoreSuccess={restoreSuccess}
      headingRef={headingRef}
      onRestore={() => {
        void runRestore();
      }}
      onRetry={() => {
        void runRestore();
      }}
      listHref={
        clubSlug
          ? scopedAppLinkTarget(`/clubs/${encodeURIComponent(clubSlug)}/app`, "/app/host/sessions?view=trash")
          : "/app/host/sessions?view=trash"
      }
      LinkComponent={LinkComponent}
    />
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
    const result = await hostSessionLifecycleResultFromResponse(await mutate());
    if (result.ok) {
      await onSessionRecordsChanged?.(sessionId);
    }
    return result;
  }, [onSessionRecordsChanged]);

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
    previewSessionImport: hostSessionEditorPreviewActions.previewSessionImport,
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

export function NewHostSessionRoute({
  returnTarget,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
  onSessionRecordsChanged,
}: HostSessionEditorRouteProps) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => contextFromClubSlug(clubSlug), [clubSlug]);
  const { location, replaceLocation } = useHostSessionEditorLocation({ homePanel: "basic" });
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
  const scheduleDefaultsQuery = useQuery(hostSessionScheduleDefaultsQuery(context));
  useRecordHostScheduleDefaultsOutcome(scheduleDefaultsQuery);
  const scheduleDefaultsLoadState = resolveHostScheduleDefaultsLoadState(scheduleDefaultsQuery);
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
      scheduleDefaultsLoadState={scheduleDefaultsLoadState}
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
  const [restored, setRestored] = useState(false);
  const loaderTrash = (loaderData.mode ?? "active") === "trash" && !restored;
  const sessionQuery = useQuery({
    ...hostSessionDetailQuery(sessionId, context),
    enabled: !loaderTrash,
  });
  const trashFromDetailMiss = !restored && isHostSessionNotFoundError(sessionQuery.error);
  const trashQuery = useQuery({
    ...hostSessionTrashDetailQuery(sessionId, context),
    enabled: loaderTrash || trashFromDetailMiss,
    retry: false,
  });
  const showTrash = !restored && (
    loaderTrash
    || trashFromDetailMiss
    || Boolean(trashQuery.data)
    || isHostSessionTrashExpiredError(trashQuery.error)
  );
  const activeQueriesEnabled = !showTrash;
  const dispatchesQuery = useQuery({
    ...hostSessionManualDispatchesQuery(
      { sessionId, page: { limit: EDITOR_MANUAL_DISPATCH_PAGE_LIMIT } },
      context,
    ),
    enabled: activeQueriesEnabled,
  });
  const recordEditorQuery = useQuery({
    ...hostSessionRecordEditorQuery(sessionId, context),
    enabled: activeQueriesEnabled,
  });
  const historyQuery = useQuery({
    ...hostSessionRecordHistoryQuery(
      sessionId,
      { limit: EDITOR_HISTORY_PAGE_LIMIT },
      context,
    ),
    enabled: activeQueriesEnabled,
  });

  if (showTrash) {
    if (trashQuery.isPending && !trashQuery.data && !isHostSessionTrashExpiredError(trashQuery.error)) {
      return <HostSessionEditorQueryState status="loading" hideTitle />;
    }
    if (trashQuery.isError && !isHostSessionTrashExpiredError(trashQuery.error) && !trashQuery.data) {
      return (
        <HostSessionEditorQueryState
          status="error"
          hideTitle
          onRetry={() => {
            void trashQuery.refetch();
          }}
        />
      );
    }
    return (
      <HostSessionTrashTombstoneRoute
        sessionId={sessionId}
        clubSlug={clubSlug}
        trash={trashQuery.data ?? null}
        expired={isHostSessionTrashExpiredError(trashQuery.error)}
        restoreSession={actions.restoreSession}
        LinkComponent={LinkComponent}
        onRestored={() => setRestored(true)}
      />
    );
  }

  if (!sessionQuery.data || !recordEditorQuery.data) {
    if (sessionQuery.isError || recordEditorQuery.isError) {
      return (
        <HostSessionEditorQueryState
          status="error"
          hideTitle
          onRetry={() => {
            void Promise.all([
              sessionQuery.refetch(),
              recordEditorQuery.refetch(),
            ]);
          }}
        />
      );
    }
    return <HostSessionEditorQueryState status="loading" hideTitle />;
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
    location: { panel: "focus", source: "manual" },
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
    location: HostSessionWorkspaceLocation;
    onChange: (next: HostSessionWorkspaceLocation) => void;
  };
}) {
  const queryClient = useQueryClient();
  const saveMutation = useSaveHostSessionRecordDraftMutation(context);
  const rebaseMutation = useRebaseHostSessionRecordDraftMutation(context);
  const restoreMutation = useRestoreHostSessionRevisionToDraftMutation(context);
  const restoreChangeMutation = useRestoreHostSessionChangeMutation(context);
  const [pendingUndo, setPendingUndo] = useState<{
    receipt: HostSessionChangeReceipt;
    description: string;
    error: string | null;
    sessionState?: HostSessionDetailResponse["state"];
  } | null>(null);
  const [undoConfirm, setUndoConfirm] = useState<{
    changeId: string;
    items: ReturnType<typeof buildHostSessionRestorePreviewItemView>[];
    expectedCurrentHash: string;
    submitting: boolean;
    error: string | null;
  } | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<{
    message: string;
    changeId: string;
  } | null>(null);
  const pendingUndoRef = useRef(pendingUndo);
  useEffect(() => {
    pendingUndoRef.current = pendingUndo;
  }, [pendingUndo]);
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
  const rebasedDraftRevisionRef = useRef<number | null>(null);
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

  const reloadAuthoritativeDraft = useCallback(async () => {
    rebasedDraftRevisionRef.current = null;
    await controller.reloadDraft();
  }, [controller]);

  const onApplyCompleted = useCallback(async () => {
    await Promise.all([
      reloadAuthoritativeDraft(),
      queryClient.invalidateQueries({
        queryKey: hostSessionRecordKeys.historyRoot(recordEditor.sessionId, context),
      }),
      queryClient.invalidateQueries({
        queryKey: hostSessionKeys.detail(recordEditor.sessionId, context),
      }),
    ]);
    navigation.onChange({ panel: "focus", source: "manual" });
  }, [context, navigation, queryClient, recordEditor.sessionId, reloadAuthoritativeDraft]);

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
      rebasedDraftRevisionRef.current = draft.draftRevision;
      let previewDraftRevision = draft.draftRevision;
      try {
        const latest = await reloadRecordEditor();
        if (latest) {
          controller.adoptEditor(latest);
          const latestDraftRevision = latest.draft?.draftRevision;
          if (latestDraftRevision !== undefined && latestDraftRevision > draft.draftRevision) {
            previewDraftRevision = latestDraftRevision;
            rebasedDraftRevisionRef.current = null;
          }
          if (latest.draftLiveBaseStale) {
            setRebaseError(
              "재확인 중 세션이 다시 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.",
            );
          }
        }
      } catch {
        // Keep the successful rebase response as the revision authority when refresh fails.
      }
      controller.adoptDraftRevision(previewDraftRevision);
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
    const expectedDraftRevision =
      rebasedDraftRevisionRef.current ?? controller.getExpectedDraftRevision();
    if (expectedDraftRevision === null) {
      setConfirmationMessage({ kind: "alert", text: "먼저 작업 초안을 저장해 주세요." });
      return null;
    }
    setApplyPreviewRefreshing(true);
    try {
      const preview = await previewMutation.mutateAsync({
        sessionId: recordEditor.sessionId,
        request: {
          expectedDraftRevision,
          expectedLiveRevision: recordEditor.liveRevision,
        },
      });
      const request = {
        applyRequestId: crypto.randomUUID(),
        expectedDraftRevision,
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
        draftRevision: expectedDraftRevision,
        visibility: controller.snapshot.visibility,
        hasAppliedRecord: hasAppliedSessionRecord({
          liveRevision: recordEditor.liveRevision,
          liveSnapshot: recordEditor.liveSnapshot,
        }),
      });
      setConfirmationOpen(true);
      return preview;
    } finally {
      setApplyPreviewRefreshing(false);
    }
  }, [
    controller,
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
        await reloadAuthoritativeDraft();
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
    onApplyCompleted,
    pendingApply,
    queryClient,
    reloadAuthoritativeDraft,
  ]);

  const captureChangeReceipt = useCallback((
    receipt: HostSessionChangeReceipt,
    description: string,
    sessionState?: HostSessionDetailResponse["state"],
  ) => {
    if (!receipt.undoAvailable) {
      setPendingUndo(null);
      setUndoConfirm(null);
      setRestoreNotice(null);
      return;
    }
    setPendingUndo({ receipt, description, error: null, sessionState });
    setUndoConfirm(null);
    setRestoreNotice(null);
  }, []);

  const editorActions = useMemo(
    () => wrapHostSessionEditorActionsForUndo(actions, captureChangeReceipt),
    [actions, captureChangeReceipt],
  );

  const openHistoryPanel = useCallback(() => {
    navigation.onChange({ panel: "history", source: "manual" });
  }, [navigation]);

  const dismissUndo = useCallback(() => {
    setPendingUndo(null);
    setUndoConfirm(null);
    setRestoreNotice(null);
  }, []);

  const memberLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    for (const attendee of session.attendees ?? []) {
      if (attendee.displayName) {
        labels.set(attendee.membershipId, attendee.displayName);
      }
    }
    return labels;
  }, [session.attendees]);

  const previewItemsFromRestore = useCallback((items: HostSessionRestorePreview["items"]) => (
    items.map((item) => buildHostSessionRestorePreviewItemView(item, {
      memberLabel: item.subjectId ? memberLabelById.get(item.subjectId) ?? null : null,
    }))
  ), [memberLabelById]);

  const restoreChangeFailureMessage = useCallback((error: unknown) => {
    const code = apiErrorCode(error);
    if (code === "HOST_SESSION_RESTORE_STALE") {
      return hostSessionRestoreStaleExplanation();
    }
    if (code === "HOST_SESSION_CHANGE_NOT_RESTORABLE") {
      return hostSessionRestoreBlockedExplanation("SNAPSHOT_UNAVAILABLE");
    }
    return "되돌리지 못했습니다. 변경 내역에서 다시 확인하세요.";
  }, []);

  const showRestoreError = useCallback((message: string, changeId: string) => {
    setUndoConfirm(null);
    if (pendingUndoRef.current) {
      setPendingUndo((current) => current ? { ...current, error: message } : current);
      setRestoreNotice(null);
      return;
    }
    setRestoreNotice({ message, changeId });
  }, []);

  const startChangeRestore = useCallback(async (changeId: string) => {
    try {
      const preview = await queryClient.fetchQuery(
        hostSessionRestorePreviewQuery(session.sessionId, changeId, context),
      );
      if (!preview.canRestore) {
        showRestoreError(hostSessionRestoreBlockedExplanation(preview.blockedReason), changeId);
        return;
      }
      setRestoreNotice(null);
      setUndoConfirm({
        changeId: preview.changeId,
        items: previewItemsFromRestore(preview.items),
        expectedCurrentHash: preview.expectedCurrentHash,
        submitting: false,
        error: null,
      });
    } catch (error) {
      showRestoreError(restoreChangeFailureMessage(error), changeId);
    }
  }, [
    context,
    previewItemsFromRestore,
    queryClient,
    restoreChangeFailureMessage,
    session.sessionId,
    showRestoreError,
  ]);

  const undoLifecycle = useCallback(async () => {
    const reverse = reverseLifecycleAction(pendingUndo?.sessionState ?? session.state);
    if (!reverse) {
      setPendingUndo((current) => current
        ? { ...current, error: hostSessionRestoreBlockedExplanation("LIFECYCLE_INVERSE_NOT_VALID") }
        : current);
      return;
    }
    const request: HostSessionReverseRequest = { reasonCode: "ACCIDENTAL_TRANSITION" };
    const result = reverse.kind === "reopen"
      ? await editorActions.reopenSession(session.sessionId, request)
      : reverse.kind === "unpublish"
        ? await editorActions.unpublishSession(session.sessionId, request)
        : await editorActions.returnSessionToDraft(session.sessionId, request);
    if (!result.ok) {
      setPendingUndo((current) => current ? { ...current, error: result.message } : current);
    }
  }, [editorActions, pendingUndo?.sessionState, session.sessionId, session.state]);

  const requestUndo = useCallback(async () => {
    if (!pendingUndo) {
      return;
    }
    if (pendingUndo.receipt.kind === "LIFECYCLE") {
      await undoLifecycle();
      return;
    }
    await startChangeRestore(pendingUndo.receipt.changeId);
  }, [pendingUndo, startChangeRestore, undoLifecycle]);

  const confirmChangeRestore = useCallback(async () => {
    if (!undoConfirm) {
      return;
    }
    setUndoConfirm((current) => current ? { ...current, submitting: true, error: null } : current);
    try {
      const receipt = await restoreChangeMutation.mutateAsync({
        sessionId: session.sessionId,
        changeId: undoConfirm.changeId,
        request: { expectedCurrentHash: undoConfirm.expectedCurrentHash },
      });
      if (receipt.undoAvailable) {
        captureChangeReceipt(receipt, hostSessionChangeUndoDescription(receipt.kind));
      } else {
        setPendingUndo(null);
        setUndoConfirm(null);
        setRestoreNotice(null);
      }
    } catch (error) {
      const message = restoreChangeFailureMessage(error);
      setUndoConfirm((current) => current ? { ...current, submitting: false, error: message } : current);
      setPendingUndo((current) => current ? { ...current, error: message } : current);
    }
  }, [
    captureChangeReceipt,
    restoreChangeFailureMessage,
    restoreChangeMutation,
    session.sessionId,
    undoConfirm,
  ]);

  const pendingUndoView = pendingUndo
    ? {
        description: pendingUndo.description,
        error: pendingUndo.error,
        onUndo: () => {
          void requestUndo();
        },
        onOpenHistory: openHistoryPanel,
        onDismiss: dismissUndo,
      }
    : null;

  const undoConfirmView = undoConfirm
    ? {
        items: undoConfirm.items,
        submitting: undoConfirm.submitting,
        error: undoConfirm.error,
        onConfirm: () => {
          void confirmChangeRestore();
        },
        onCancel: () => setUndoConfirm(null),
      }
    : null;

  const restoreNoticeView = restoreNotice && !pendingUndo
    ? {
        message: restoreNotice.message,
        onRetry: () => {
          void startChangeRestore(restoreNotice.changeId);
        },
        onOpenHistory: openHistoryPanel,
        onDismiss: () => setRestoreNotice(null),
      }
    : null;

  return (
    <>
      <HostSessionEditor
        session={session}
        notificationDispatches={notificationDispatches}
        returnTarget={returnTarget}
        actions={editorActions}
        pendingUndo={pendingUndoView}
        undoConfirm={undoConfirmView}
        restoreNotice={restoreNoticeView}
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
          onSnapshotChange: (nextSnapshot) => {
            rebasedDraftRevisionRef.current = null;
            controller.updateSnapshot(nextSnapshot);
          },
          onReloadDraft: reloadAuthoritativeDraft,
          onRebaseDraft: rebaseDraft,
          onDraftCommitted: async ({ draftRevision }) => {
            rebasedDraftRevisionRef.current = null;
            controller.adoptDraftRevision(draftRevision);
            await reloadAuthoritativeDraft();
            navigation.onChange({ panel: "records", source: "manual" });
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
            rebasedDraftRevisionRef.current = null;
            controller.adoptEditor({
              ...recordEditor,
              draft,
              draftLiveBaseStale: draft.baseLiveRevision !== recordEditor.liveRevision,
            });
          },
          onRestoreCompleted: () => {
            navigation.onChange({ panel: "records", source: "manual" });
          },
          onRestoreChange: (changeId) => startChangeRestore(changeId),
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
