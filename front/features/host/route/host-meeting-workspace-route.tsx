import { lazy, Suspense, useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useLocation, useNavigate, useParams } from "react-router";
import type { HostSessionEditorLinkComponent } from "@/features/host/ui/host-session-editor";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import type { HostMeetingRecordReadiness } from "@/features/host/model/host-meeting-record-readiness";
import { buildHostMeetingWorkspace, type HostMeetingLocation, type HostMeetingTask } from "@/features/host/model/host-session-workspace-model";
import { formatDateTimeLabel } from "@/shared/ui/readmates-display";
import { buildHostMeetingUrl, canonicalizeLegacyHostMeetingUrl, parseHostMeetingLocation } from "@/features/host/model/host-session-workspace-navigation";
import type { ManualNotificationDispatchListResponse } from "@/features/host/api/host-contracts";
import type { HostSessionHistoryPage, HostSessionRecordEditor, HostSessionReverseRequest } from "@/features/host/api/host-session-record-contracts";
import {
  hostSessionDetailQuery,
  hostSessionTrashDetailQuery,
  invalidateHostSessionRecordSurfaces,
  isHostSessionNotFoundError,
} from "@/features/host/queries/host-session-queries";
import {
  hostPublicConvergenceQuery,
  useRetryHostPublicConvergenceMutation,
} from "@/features/host/queries/host-session-queries";
import { buildPublicConvergenceStatus } from "@/features/host/model/public-convergence-model";
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
import { HostMeetingWorkspace } from "@/features/host/ui/meeting-workspace/host-meeting-workspace";
import { buildMeetingAudienceProjections } from "@/features/host/ui/meeting-workspace/meeting-audience-projections";
import { MeetingRelatedWork } from "@/features/host/ui/meeting-workspace/meeting-related-work";
import { MeetingNotificationWorkspace } from "@/features/host/ui/meeting-workspace/meeting-notification-workspace";
import type { HostSessionRecordsChangedEvent } from "./host-session-editor-route";
import { useHostMeetingWorkspaceActions } from "./host-meeting-workspace-actions";
import type { HostMeetingWorkspaceRouteData } from "./host-meeting-workspace-data";
import {
  beginHostMeetingRouteCommit,
} from "@/shared/observability/host-meeting-performance";
import "./host-meeting-workspace.css";

const EditHostSessionRoute = lazy(async () => {
  const module = await import("./host-session-editor-route");
  return { default: module.EditHostSessionRoute };
});

const HostSessionEditor = lazy(() => import("@/features/host/ui/host-session-editor"));

const EditHostSessionRecordWorkflow = lazy(async () => {
  const module = await import("./host-session-editor-route");
  return { default: module.EditHostSessionRecordWorkflow };
});

function DeferredHostWorkspace({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p role="status" className="rm-meeting-panel-state">모임 작업을 불러오는 중입니다.</p>}>{children}</Suspense>;
}

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

function recordReadinessForMeeting(
  state: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED",
  readiness: HostMeetingRecordReadiness | undefined,
): HostMeetingRecordReadiness {
  if (readiness) return readiness;
  return state === "CLOSED" || state === "PUBLISHED"
    ? { status: "pending" }
    : { status: "not-required" };
}

type MeetingPanelViewModel =
  | { kind: "loading"; task: HostMeetingTask }
  | { kind: "known-empty"; task: HostMeetingTask; content: ReactNode }
  | { kind: "unavailable"; task: HostMeetingTask }
  | { kind: "stale-cached"; task: HostMeetingTask; content: ReactNode; observedAt: string }
  | { kind: "ready"; task: HostMeetingTask; content: ReactNode };

const panelCopy: Record<HostMeetingTask, { label: string; empty: string }> = {
  overview: { label: "개요", empty: "아직 표시할 개요가 없습니다" },
  responses: { label: "참석 응답", empty: "아직 참석 응답이 없습니다" },
  attendance: { label: "실제 출석", empty: "아직 출석 대상이 없습니다" },
  records: { label: "모임 기록", empty: "아직 모임 기록이 없습니다" },
  notifications: { label: "알림", empty: "아직 발송한 알림이 없습니다" },
  history: { label: "변경 내역", empty: "아직 변경 기록이 없습니다" },
};

function MeetingPanel({ panel, onRetry }: { panel: MeetingPanelViewModel; onRetry: () => void }) {
  const copy = panelCopy[panel.task];
  if (panel.kind === "loading") {
    return <p role="status" className="rm-meeting-panel-state">{copy.label}을 불러오는 중입니다.</p>;
  }
  if (panel.kind === "known-empty") {
    return <div role="status" className="rm-meeting-panel-state"><p>{copy.empty}</p>{panel.content}</div>;
  }
  if (panel.kind === "unavailable") {
    return (
      <div role="alert" className="rm-meeting-panel-state is-error">
        <p>{copy.label}을 불러오지 못했습니다.</p>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onRetry}>{copy.label} 다시 시도</button>
      </div>
    );
  }
  if (panel.kind === "stale-cached") {
    return (
      <div className="rm-meeting-panel-state__stale">
        <div role="status" className="rm-meeting-panel-state">
          {formatDateTimeLabel(panel.observedAt)}에 확인한 내용을 표시합니다. 최신 확인이 필요한 행동은 잠시 사용할 수 없습니다.
          <button type="button" className="btn btn-quiet btn-sm" onClick={onRetry}>최신 내용 확인</button>
        </div>
        {panel.content}
      </div>
    );
  }
  return <>{panel.content}</>;
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
  const pendingSheetFocusRef = useRef<"basic" | "history" | null>(null);
  useEffect(() => {
    const canonicalHref = canonicalizeLegacyHostMeetingUrl(currentUrl);
    if (canonicalHref && canonicalHref !== currentUrl) {
      void navigate(canonicalHref, { replace: true, state: routerLocation.state });
    }
  }, [currentUrl, navigate, routerLocation.state]);
  const changeMeetingLocation = useCallback((next: HostMeetingLocation) => {
    const href = buildHostMeetingUrl(currentUrl, next);
    if (href !== currentUrl) void navigate(href, { state: routerLocation.state });
  }, [currentUrl, navigate, routerLocation.state]);
  const navigation = useMemo(() => ({
    location: compatibilityLocation(meetingLocation),
    onChange: (next: ReturnType<typeof compatibilityLocation>) => {
      const currentPanel = compatibilityLocation(meetingLocation).panel;
      if (next.panel === "focus" && (currentPanel === "basic" || currentPanel === "history")) {
        pendingSheetFocusRef.current = currentPanel;
      }
      changeMeetingLocation(meetingLocationFromCompatibility(meetingLocation, next));
    },
  }), [changeMeetingLocation, meetingLocation]);
  useEffect(() => {
    const pendingPanel = pendingSheetFocusRef.current;
    if (!pendingPanel || meetingLocation.overviewEditOpen || meetingLocation.task === "history") return;
    let remainingFrames = 10;
    let frame = 0;
    const focusTrigger = () => {
      const trigger = document.querySelector<HTMLElement>(
        `[aria-controls="workspace-panel-${pendingPanel}"]`,
      );
      if (trigger) {
        trigger.focus();
        pendingSheetFocusRef.current = null;
        return;
      }
      remainingFrames -= 1;
      if (remainingFrames > 0) frame = requestAnimationFrame(focusTrigger);
    };
    frame = requestAnimationFrame(focusTrigger);
    return () => cancelAnimationFrame(frame);
  }, [meetingLocation.overviewEditOpen, meetingLocation.task]);

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
  const cachedTrash = queryClient.getQueryData(
    hostSessionTrashDetailQuery(sessionId, context).queryKey,
  );
  const convergenceQuery = useQuery({
    ...hostPublicConvergenceQuery(sessionId, context),
    enabled: loaderData.mode === "active",
  });
  const retryConvergence = useRetryHostPublicConvergenceMutation(context);
  const recordPrerequisite = baseQuery.data?.state === "CLOSED" || baseQuery.data?.state === "PUBLISHED";
  const panelStates = useHostMeetingPanelQueries({
    task: meetingLocation.task,
    sessionId,
    context,
    recordPrerequisite,
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
  const measuredRouteIdentityRef = useRef<string | null>(null);
  const editorPrimaryActionRef = useRef<(() => void) | null>(null);

  useInsertionEffect(() => {
    if (!baseQuery.data || measuredRouteIdentityRef.current === routeIdentity) return;
    measuredRouteIdentityRef.current = routeIdentity;
    beginHostMeetingRouteCommit(baseQuery.dataUpdatedAt);
  }, [baseQuery.data, baseQuery.dataUpdatedAt, routeIdentity]);

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
      <DeferredHostWorkspace>
        <EditHostSessionRoute
          returnTarget={returnStatePurged ? undefined : returnTarget}
          LinkComponent={LinkComponent}
          hostDashboardReturnTarget={hostDashboardReturnTarget}
          readmatesReturnState={returnStatePurged ? undefined : readmatesReturnState}
          onSessionRecordsChanged={onSessionRecordsChanged}
        />
      </DeferredHostWorkspace>
    );
  }

  if (!baseQuery.data) {
    if (cachedTrash || isHostSessionNotFoundError(baseQuery.error)) {
      return (
        <DeferredHostWorkspace>
          <EditHostSessionRoute
            returnTarget={returnStatePurged ? undefined : returnTarget}
            LinkComponent={LinkComponent}
            hostDashboardReturnTarget={hostDashboardReturnTarget}
            readmatesReturnState={returnStatePurged ? undefined : readmatesReturnState}
            onSessionRecordsChanged={onSessionRecordsChanged}
          />
        </DeferredHostWorkspace>
      );
    }
    const loadingView = buildHostMeetingWorkspace({
      currentUrl,
      state: "DRAFT",
      meetingDate: "",
      today: todayIsoDate(),
      unansweredResponseCount: 0,
      unknownAttendanceCount: 0,
      recordReadiness: { status: "not-required" },
    });
    return (
      <HostMeetingWorkspace
        view={{
          ...loadingView,
          primaryAction: {
            kind: "LOADING",
            label: "모임 확인 중",
            task: "overview",
            disabled: true,
          },
        }}
        header={{ sessionNumber: null, title: "모임" }}
        facts={loadingView.facts}
        relatedWork={<MeetingRelatedWork tasks={loadingView.relatedTasks} LinkComponent={LinkComponent} />}
        panel={
          <MeetingPanel
            panel={baseQuery.isError
              ? { kind: "unavailable", task: meetingLocation.task }
              : { kind: "loading", task: meetingLocation.task }}
            onRetry={() => void baseQuery.refetch()}
          />
        }
        onPrimaryAction={() => undefined}
        onRetryReadiness={() => void baseQuery.refetch()}
      />
    );
  }

  const session = baseQuery.data;
  const activeAttendees = session.attendees.filter((item) => (item.participationStatus ?? "ACTIVE") === "ACTIVE");
  const unknownAttendanceCount = activeAttendees.filter((item) => item.attendanceStatus === "UNKNOWN").length;
  const recordReadiness = recordReadinessForMeeting(session.state, panelStates.recordReadiness);
  const recordRetry = panelStates.record.kind === "unavailable" || panelStates.record.kind === "stale-cached"
    ? panelStates.record.retry
    : undefined;
  const workspace = buildHostMeetingWorkspace({
    currentUrl,
    state: session.state,
    meetingDate: session.date,
    today: todayIsoDate(),
    unansweredResponseCount: activeAttendees.filter((item) => item.rsvpStatus === "NO_RESPONSE").length,
    unknownAttendanceCount,
    recordReadiness,
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
      <DeferredHostWorkspace>
        <EditHostSessionRecordWorkflow
          composeDeck={false}
          primaryActionRef={editorPrimaryActionRef}
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
      </DeferredHostWorkspace>
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
      <MeetingNotificationWorkspace>
        <HostSessionNotificationActions
          sessionId={session.sessionId}
          state={session.state}
          visibility={session.visibility}
          feedbackDocumentUploaded={session.feedbackDocument.uploaded}
          dispatches={notifications.items}
          LinkComponent={LinkComponent}
        />
      </MeetingNotificationWorkspace>
    ),
  );

  const baseContent = (
    <DeferredHostWorkspace>
      <HostSessionEditor
        composeDeck={false}
        primaryActionRef={editorPrimaryActionRef}
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
    </DeferredHostWorkspace>
  );
  const resolvedPanel: MeetingPanelViewModel = baseTask
    ? { kind: "ready", task: meetingLocation.task, content: baseContent }
    : panel
      ? panel.kind === "ready"
        ? { kind: "ready", task: meetingLocation.task, content: panel.data }
        : panel.kind === "known-empty"
          ? { kind: "known-empty", task: meetingLocation.task, content: panel.data }
          : panel.kind === "stale-cached"
            ? { kind: "stale-cached", task: meetingLocation.task, content: panel.data, observedAt: panel.observedAt }
            : panel.kind === "unavailable"
              ? { kind: "unavailable", task: meetingLocation.task }
              : { kind: "loading", task: meetingLocation.task }
      : { kind: "ready", task: meetingLocation.task, content: baseContent };

  const primaryAction = {
    ...workspace.primaryAction,
    disabled: workspace.primaryAction.disabled || baseQuery.isFetching || baseQuery.isError,
    reason: workspace.primaryAction.reason
      ?? (baseQuery.isFetching ? "최신 모임 상태를 확인하고 있습니다." : undefined),
  };
  const convergence = buildPublicConvergenceStatus(convergenceQuery.data);
  const reverse = reverseLifecycleAction(session.state);

  return (
    <HostMeetingWorkspace
      view={{ ...workspace, primaryAction }}
      header={{
        sessionNumber: session.sessionNumber,
        title: session.title || session.bookTitle || "모임",
        date: session.date,
        time: session.startTime,
        location: session.locationLabel,
      }}
      facts={workspace.facts}
      relatedWork={<MeetingRelatedWork tasks={workspace.relatedTasks} LinkComponent={LinkComponent} />}
      projections={buildMeetingAudienceProjections({
        visibility: session.visibility,
        lifecycle: session.state,
      })}
      recordReadiness={recordReadiness}
      publicRecordHref={session.state === "PUBLISHED"
        ? `/app/sessions/${encodeURIComponent(session.sessionId)}`
        : null}
      onCreateRevision={session.state === "PUBLISHED"
        ? () => changeMeetingLocation({ task: "records", overviewEditOpen: false, recordSource: "manual" })
        : null}
      reverseAction={reverse
        ? { label: reverse.label, onClick: requestLifecycleReverse }
        : null}
      onOpenBasic={() => changeMeetingLocation({
        task: "overview",
        overviewEditOpen: true,
        recordSource: "manual",
      })}
      onOpenHistory={() => changeMeetingLocation({
        task: "history",
        overviewEditOpen: false,
        recordSource: "manual",
      })}
      panel={
        <MeetingPanel
          panel={resolvedPanel}
          onRetry={() => {
            if (panel?.kind === "unavailable" || panel?.kind === "stale-cached") panel.retry();
          }}
        />
      }
      recovery={convergence ? (
        <div className={`rm-focus-deck__convergence is-${convergence.tone}`}>
          <p className="rm-focus-deck__convergence-origin">{convergence.originLabel}</p>
          <p role={convergence.tone === "failed" ? "alert" : "status"}>{convergence.providerLabel}</p>
          <p className="small muted">{convergence.expectation}</p>
          {convergence.canRetry ? (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                const convergenceId = convergenceQuery.data?.convergenceId;
                if (convergenceId) void retryConvergence.mutateAsync({ sessionId, convergenceId });
              }}
            >
              공개 캐시 회수 다시 시도
            </button>
          ) : null}
        </div>
      ) : null}
      onPrimaryAction={() => {
        if (meetingLocation.task !== workspace.primaryAction.task) {
          changeMeetingLocation({
            task: workspace.primaryAction.task,
            overviewEditOpen: false,
            recordSource: "manual",
          });
          return;
        }
        editorPrimaryActionRef.current?.();
      }}
      onRetryReadiness={recordRetry}
      LinkComponent={LinkComponent}
    />
  );
}
