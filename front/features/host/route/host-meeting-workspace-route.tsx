import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useLocation, useNavigate, useParams } from "react-router";
import HostSessionEditor, { type HostSessionEditorLinkComponent } from "@/features/host/ui/host-session-editor";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import { buildHostMeetingWorkspace, type HostMeetingLocation, type HostMeetingTask } from "@/features/host/model/host-session-workspace-model";
import { buildHostMeetingUrl, parseHostMeetingLocation } from "@/features/host/model/host-session-workspace-navigation";
import type { ManualNotificationDispatchListResponse } from "@/features/host/api/host-contracts";
import type { HostSessionHistoryPage, HostSessionRecordEditor, HostSessionReverseRequest } from "@/features/host/api/host-session-record-contracts";
import { hostSessionDetailQuery, invalidateHostSessionRecordSurfaces } from "@/features/host/queries/host-session-queries";
import { hostSessionRecordEditorQuery, hostSessionRecordHistoryQuery, useRestoreHostSessionRevisionToDraftMutation } from "@/features/host/queries/host-session-record-queries";
import { hostSessionRestorePreviewQuery, useRestoreHostSessionChangeMutation } from "@/features/host/queries/host-session-recovery-queries";
import { useHostMeetingPanelQueries, type PanelLoadState } from "@/features/host/queries/host-meeting-panel-queries";
import { registerHostSensitiveState } from "@/features/host/storage/host-sensitive-storage";
import { SessionHistoryPanel } from "@/features/host/ui/session-editor/session-history-panel";
import { HostSessionNotificationActions } from "@/features/host/ui/session-editor/session-editor-notifications";
import { SessionLifecycleConfirmDialog } from "@/features/host/ui/session-editor/session-lifecycle-confirm-dialog";
import { WorkspaceUndoBar, type WorkspaceUndoConfirm } from "@/features/host/ui/session-workspace/workspace-undo-bar";
import {
  buildHostSessionRestorePreviewItemView,
  hostSessionRestoreBlockedExplanation,
} from "@/features/host/model/host-session-editor-view-model";
import {
  lifecycleConfirmCopy,
  reverseLifecycleAction,
  type ReverseLifecycleConfirmKind,
} from "@/features/host/model/host-session-lifecycle-model";
import { HostMeetingWorkspaceRouteFrame } from "@/features/host/ui/meeting-workspace/host-meeting-workspace-route-frame";
import {
  EditHostSessionRecordWorkflow,
  EditHostSessionRoute,
  type HostSessionRecordsChangedEvent,
} from "./host-session-editor-route";
import { useHostMeetingWorkspaceActions } from "./host-meeting-workspace-actions";
import type { HostMeetingWorkspaceRouteData } from "./host-meeting-workspace-data";

type HostMeetingWorkspaceRouteProps = {
  returnTarget?: ReadmatesReturnTarget;
  LinkComponent?: HostSessionEditorLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
  onSessionRecordsChanged?: (event: HostSessionRecordsChangedEvent) => void | Promise<void>;
};

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compatibilityLocation(location: HostMeetingLocation) {
  if (location.overviewEditOpen) return { panel: "basic" as const, source: "manual" as const };
  if (location.task === "attendance") return { panel: "attendance" as const, source: "manual" as const };
  if (location.task === "records") return { panel: "records" as const, source: location.recordSource };
  if (location.task === "history") return { panel: "history" as const, source: "manual" as const };
  return { panel: "focus" as const, source: "manual" as const };
}

function meetingLocationFromCompatibility(
  current: HostMeetingLocation,
  next: ReturnType<typeof compatibilityLocation>,
): HostMeetingLocation {
  if (next.panel === "basic") return { task: "overview", overviewEditOpen: true, recordSource: "manual" };
  if (next.panel === "attendance") return { task: "attendance", overviewEditOpen: false, recordSource: "manual" };
  if (next.panel === "records") return { task: "records", overviewEditOpen: false, recordSource: next.source };
  if (next.panel === "history") return { task: "history", overviewEditOpen: false, recordSource: "manual" };
  return current.task === "responses"
    ? { task: "responses", overviewEditOpen: false, recordSource: "manual" }
    : { task: "overview", overviewEditOpen: false, recordSource: "manual" };
}

function mapPanelState<T>(
  state: PanelLoadState<T>,
  render: (data: T, stale: { observedAt: string; retry: () => void } | null) => ReactNode,
): PanelLoadState<ReactNode> {
  if (state.kind === "ready") return { kind: "ready", data: render(state.data, null) };
  if (state.kind === "stale-cached") {
    return {
      kind: "stale-cached",
      data: render(state.data, { observedAt: state.observedAt, retry: state.retry }),
      observedAt: state.observedAt,
      retry: state.retry,
    };
  }
  if (state.kind === "known-empty") {
    return { kind: "known-empty", data: render(state.data, null) };
  }
  return state;
}

function panelForTask(
  task: HostMeetingTask,
  states: ReturnType<typeof useHostMeetingPanelQueries>,
  renderRecord: (data: HostSessionRecordEditor, stale: { observedAt: string; retry: () => void } | null) => ReactNode,
  renderHistory: (data: HostSessionHistoryPage, stale: { observedAt: string; retry: () => void } | null) => ReactNode,
  renderNotifications: (data: ManualNotificationDispatchListResponse) => ReactNode,
): PanelLoadState<ReactNode> | null {
  if (task === "records") return mapPanelState(states.record, renderRecord);
  if (task === "history") return mapPanelState(states.history, renderHistory);
  if (task === "notifications") return mapPanelState(states.notifications, (data) => renderNotifications(data));
  return null;
}

export function HostMeetingWorkspaceRoute({
  returnTarget,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
  onSessionRecordsChanged,
}: HostMeetingWorkspaceRouteProps) {
  const loaderData = useLoaderData() as HostMeetingWorkspaceRouteData;
  const { clubSlug, sessionId: routeSessionId } = useParams<{ clubSlug: string; sessionId: string }>();
  const sessionId = routeSessionId ?? loaderData.sessionId;
  const context = useMemo(() => requireHostClubContext(clubSlug), [clubSlug]);
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUrl = `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`;
  const meetingLocation = useMemo(
    () => parseHostMeetingLocation(routerLocation.search),
    [routerLocation.search],
  );
  const changeMeetingLocation = useCallback((next: HostMeetingLocation) => {
    const href = buildHostMeetingUrl(currentUrl, next);
    if (href !== currentUrl) void navigate(href, { state: routerLocation.state });
  }, [currentUrl, navigate, routerLocation.state]);
  const navigation = useMemo(() => ({
    location: compatibilityLocation(meetingLocation),
    onChange: (next: ReturnType<typeof compatibilityLocation>) => {
      changeMeetingLocation(meetingLocationFromCompatibility(meetingLocation, next));
    },
  }), [changeMeetingLocation, meetingLocation]);

  const handleSessionRecordsChanged = useCallback(async (changedSessionId: string) => {
    await Promise.all([
      invalidateHostSessionRecordSurfaces(queryClient, changedSessionId, context),
      onSessionRecordsChanged?.({ sessionId: changedSessionId, clubSlug }),
    ]);
  }, [clubSlug, context, onSessionRecordsChanged, queryClient]);
  const actions = useHostMeetingWorkspaceActions(context, handleSessionRecordsChanged);
  const baseQuery = useQuery({
    ...hostSessionDetailQuery(sessionId, context),
    enabled: loaderData.mode === "active",
  });
  const panelStates = useHostMeetingPanelQueries({
    task: meetingLocation.task,
    sessionId,
    context,
  });
  const restoreRevision = useRestoreHostSessionRevisionToDraftMutation(context);
  const restoreChange = useRestoreHostSessionChangeMutation(context);
  const routeIdentity = `${context.clubSlug}:${sessionId}`;
  const [historySensitiveResetVersion, setHistorySensitiveResetVersion] = useState(0);
  const [historyClearedIdentity, setHistoryClearedIdentity] = useState<string | null>(null);
  const [returnStatePurgedIdentity, setReturnStatePurgedIdentity] = useState<string | null>(null);
  const historyCleared = historyClearedIdentity === routeIdentity;
  const returnStatePurged = returnStatePurgedIdentity === routeIdentity;
  const [historyUndoConfirm, setHistoryUndoConfirm] = useState<({
    routeIdentity: string;
    changeId: string;
    expectedCurrentHash: string;
  } & WorkspaceUndoConfirm) | null>(null);
  const [historyRestoreNotice, setHistoryRestoreNotice] = useState<{
    routeIdentity: string;
    changeId: string;
    message: string;
  } | null>(null);
  const [lifecycleConfirm, setLifecycleConfirm] = useState<{
    routeIdentity: string;
    kind: ReverseLifecycleConfirmKind;
  } | null>(null);
  const [lifecycleSubmitting, setLifecycleSubmitting] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const lifecycleRestoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const unregisterHistory = registerHostSensitiveState({
      clubSlug: context.clubSlug,
      resourceKey: `history:${sessionId}`,
      clear: () => {
        setHistoryClearedIdentity(routeIdentity);
        setHistorySensitiveResetVersion((current) => current + 1);
        setHistoryUndoConfirm(null);
        setHistoryRestoreNotice(null);
        setLifecycleConfirm(null);
        setLifecycleSubmitting(false);
        setLifecycleError(null);
      },
    });
    const unregisterReturnState = registerHostSensitiveState({
      clubSlug: context.clubSlug,
      resourceKey: `host-return-state:${sessionId}`,
      clear: () => setReturnStatePurgedIdentity(routeIdentity),
    });
    return () => {
      unregisterHistory();
      unregisterReturnState();
    };
  }, [context.clubSlug, routeIdentity, sessionId]);

  if (loaderData.mode === "trash") {
    return (
      <EditHostSessionRoute
        returnTarget={returnStatePurged ? undefined : returnTarget}
        LinkComponent={LinkComponent}
        hostDashboardReturnTarget={hostDashboardReturnTarget}
        readmatesReturnState={returnStatePurged ? undefined : readmatesReturnState}
        onSessionRecordsChanged={onSessionRecordsChanged}
      />
    );
  }

  if (!baseQuery.data) {
    return (
      <HostMeetingWorkspaceRouteFrame
        title="모임"
        activeTask={meetingLocation.task}
        baseContent={baseQuery.isError ? (
          <div role="alert" className="surface-quiet stack" style={{ padding: 18 }}>
            <p className="small">모임 기본 정보를 불러오지 못했습니다.</p>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void baseQuery.refetch()}>다시 시도</button>
          </div>
        ) : <p role="status" className="small">모임 기본 정보를 불러오는 중입니다.</p>}
      />
    );
  }

  const session = baseQuery.data;
  const recordData = panelStates.record.kind === "ready" || panelStates.record.kind === "stale-cached"
    ? panelStates.record.data
    : null;
  const activeAttendees = session.attendees.filter((item) => (item.participationStatus ?? "ACTIVE") === "ACTIVE");
  const workspace = buildHostMeetingWorkspace({
    currentUrl,
    state: session.state,
    meetingDate: session.date,
    today: todayIsoDate(),
    unansweredResponseCount: activeAttendees.filter((item) => item.rsvpStatus === "NO_RESPONSE").length,
    unknownAttendanceCount: activeAttendees.filter((item) => item.attendanceStatus === "UNKNOWN").length,
    hasRecordDraft: Boolean(recordData?.draft),
    recordDraftStale: Boolean(recordData?.draftLiveBaseStale),
    recordValidationIssueCount: recordData?.validationSummary.issues.length ?? 0,
    hasAppliedRecord: (recordData?.liveRevision ?? 0) > 0,
    publicationReady: Boolean(recordData && recordData.liveRevision > 0 && !recordData.draftLiveBaseStale && recordData.validationSummary.valid),
  });
  const baseTask = meetingLocation.task === "overview" || meetingLocation.task === "responses" || meetingLocation.task === "attendance";
  const historyAuthority = panelStates.historyAuthority;
  const historyAuthorityData = historyAuthority.kind === "ready" || historyAuthority.kind === "stale-cached"
    ? historyAuthority.data
    : null;
  const currentVersionVectorAvailable = Number.isInteger(session.versions?.sessionRevision);

  const startChangeRestore = async (changeId: string) => {
    setHistoryRestoreNotice(null);
    try {
      const preview = await queryClient.fetchQuery(hostSessionRestorePreviewQuery(sessionId, changeId, context));
      if (!preview.canRestore) {
        setHistoryRestoreNotice({
          routeIdentity,
          changeId,
          message: hostSessionRestoreBlockedExplanation(preview.blockedReason),
        });
        return;
      }
      setHistoryUndoConfirm({
        routeIdentity,
        changeId: preview.changeId,
        expectedCurrentHash: preview.expectedCurrentHash,
        items: preview.items.map((item) => buildHostSessionRestorePreviewItemView(item)),
        submitting: false,
        error: null,
        onConfirm: () => undefined,
        onCancel: () => undefined,
      });
    } catch {
      setHistoryRestoreNotice({
        routeIdentity,
        changeId,
        message: "되돌릴 내용을 확인하지 못했습니다. 변경 내역에서 다시 시도해 주세요.",
      });
    }
  };

  const confirmChangeRestore = async () => {
    if (!historyUndoConfirm || historyUndoConfirm.routeIdentity !== routeIdentity) return;
    setHistoryUndoConfirm((current) => current?.routeIdentity === routeIdentity
      ? { ...current, submitting: true, error: null }
      : current);
    try {
      await restoreChange.mutateAsync({
        sessionId,
        changeId: historyUndoConfirm.changeId,
        request: { expectedCurrentHash: historyUndoConfirm.expectedCurrentHash },
      });
      setHistoryUndoConfirm(null);
    } catch {
      setHistoryUndoConfirm((current) => current?.routeIdentity === routeIdentity ? {
        ...current,
        submitting: false,
        error: "되돌리지 못했습니다. 최신 변경 내역을 확인한 뒤 다시 시도해 주세요.",
      } : current);
    }
  };

  const requestLifecycleReverse = () => {
    const reverse = reverseLifecycleAction(session.state);
    if (!reverse || lifecycleSubmitting) return;
    lifecycleRestoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setLifecycleError(null);
    setLifecycleConfirm({ routeIdentity, kind: reverse.kind });
  };

  const confirmLifecycleReverse = async (request?: HostSessionReverseRequest) => {
    if (!lifecycleConfirm || lifecycleConfirm.routeIdentity !== routeIdentity || !request || lifecycleSubmitting) return;
    setLifecycleSubmitting(true);
    setLifecycleError(null);
    try {
      const result = lifecycleConfirm.kind === "reopen"
        ? await actions.reopenSession(sessionId, request)
        : lifecycleConfirm.kind === "unpublish"
          ? await actions.unpublishSession(sessionId, request)
          : await actions.returnSessionToDraft(sessionId, request);
      if (!result.ok) {
        setLifecycleError(result.message);
        return;
      }
      setLifecycleConfirm(null);
    } catch {
      setLifecycleError("요청을 처리하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요");
    } finally {
      setLifecycleSubmitting(false);
    }
  };

  const panel = panelForTask(
    meetingLocation.task,
    panelStates,
    (recordEditor, stale) => (
      <EditHostSessionRecordWorkflow
        session={session}
        recordEditor={recordEditor}
        historyPage={{ items: [], nextCursor: null }}
        loadHistoryPage={(cursor) => queryClient.fetchQuery(hostSessionRecordHistoryQuery(
          sessionId,
          { limit: 30, cursor },
          context,
        ))}
        notificationDispatches={[]}
        context={context}
        actions={actions}
        reloadRecordEditor={() => queryClient.fetchQuery(hostSessionRecordEditorQuery(sessionId, context))}
        returnTarget={returnStatePurged ? undefined : returnTarget}
        clubSlug={clubSlug}
        LinkComponent={LinkComponent}
        hostDashboardReturnTarget={hostDashboardReturnTarget}
        readmatesReturnState={returnStatePurged ? undefined : readmatesReturnState}
        onSessionRecordsChanged={handleSessionRecordsChanged}
        navigation={navigation}
        recordFreshness={stale ? { blocked: true, observedAt: stale.observedAt, onRetry: stale.retry } : undefined}
      />
    ),
    (history, stale) => {
      const recoveryActionsDisabled = historyCleared
        || Boolean(stale)
        || historyAuthority.kind !== "ready"
        || baseQuery.isFetching
        || baseQuery.isError
        || !currentVersionVectorAvailable;
      return (
        <>
          <SessionHistoryPanel
            key={`${routeIdentity}:${historySensitiveResetVersion}`}
            items={historyCleared ? [] : history.items}
            nextCursor={historyCleared ? null : history.nextCursor}
            expectedDraftRevision={historyAuthorityData?.draft?.draftRevision ?? null}
            restoring={restoreRevision.isPending || restoreChange.isPending || lifecycleSubmitting}
            recoveryActionsDisabled={recoveryActionsDisabled}
            onLoadMore={(cursor) => queryClient.fetchQuery(hostSessionRecordHistoryQuery(sessionId, { limit: 30, cursor }, context)).then(() => undefined)}
            onRestore={({ revisionId, expectedDraftRevision }) => restoreRevision.mutateAsync({
              sessionId,
              revisionId,
              request: { expectedDraftRevision },
            }).then(() => undefined)}
            onRestoreCompleted={() => changeMeetingLocation({ task: "records", overviewEditOpen: false, recordSource: "manual" })}
            onRestoreChange={(changeId) => startChangeRestore(changeId)}
            onReverseLifecycle={requestLifecycleReverse}
          />
          <WorkspaceUndoBar
            pendingUndo={null}
            confirm={!recoveryActionsDisabled && historyUndoConfirm?.routeIdentity === routeIdentity ? {
              items: historyUndoConfirm.items,
              submitting: historyUndoConfirm.submitting,
              error: historyUndoConfirm.error,
              onConfirm: () => void confirmChangeRestore(),
              onCancel: () => setHistoryUndoConfirm(null),
            } : null}
            restoreNotice={!recoveryActionsDisabled && historyRestoreNotice?.routeIdentity === routeIdentity ? {
              message: historyRestoreNotice.message,
              onRetry: () => void startChangeRestore(historyRestoreNotice.changeId),
              onOpenHistory: () => undefined,
              onDismiss: () => setHistoryRestoreNotice(null),
            } : null}
          />
          {!recoveryActionsDisabled && lifecycleConfirm?.routeIdentity === routeIdentity ? (
            <SessionLifecycleConfirmDialog
              copy={lifecycleConfirmCopy(lifecycleConfirm.kind)}
              errorMessage={lifecycleError}
              openSessionHref={null}
              submitting={lifecycleSubmitting}
              restoreFocusRef={lifecycleRestoreFocusRef}
              onClose={() => {
                if (lifecycleSubmitting) return;
                setLifecycleConfirm(null);
                setLifecycleError(null);
              }}
              onConfirm={(request) => void confirmLifecycleReverse(request)}
            />
          ) : null}
        </>
      );
    },
    (notifications) => (
      <HostSessionNotificationActions
        sessionId={session.sessionId}
        state={session.state}
        visibility={session.visibility}
        feedbackDocumentUploaded={session.feedbackDocument.uploaded}
        dispatches={notifications.items}
        LinkComponent={LinkComponent}
      />
    ),
  );

  return (
    <HostMeetingWorkspaceRouteFrame
      title={session.title || session.bookTitle || "모임"}
      activeTask={meetingLocation.task}
      taskLinks={workspace.tasks}
      LinkComponent={LinkComponent}
      showTitle={!baseTask && meetingLocation.task !== "records"}
      baseContent={baseTask ? (
        <HostSessionEditor
          session={session}
          actions={actions}
          clubSlug={clubSlug}
          LinkComponent={LinkComponent}
          returnTarget={returnStatePurged ? undefined : returnTarget}
          hostDashboardReturnTarget={hostDashboardReturnTarget}
          readmatesReturnState={returnStatePurged ? undefined : readmatesReturnState}
          onSessionRecordsChanged={handleSessionRecordsChanged}
          navigation={navigation}
          meetingTask={meetingLocation.task}
        />
      ) : (
        <p className="small muted">다른 작업은 위 모임 작업 목차에서 계속할 수 있습니다.</p>
      )}
      panel={panel}
    />
  );
}
