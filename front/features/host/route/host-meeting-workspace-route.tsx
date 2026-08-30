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
import type { HostSessionDetailResponse, ManualNotificationDispatchListResponse } from "@/features/host/api/host-contracts";
import type { HostSessionChangeReceipt } from "@/features/host/api/host-session-recovery-contracts";
import type { HostSessionHistoryPage, HostSessionRecordEditor, HostSessionReverseRequest } from "@/features/host/api/host-session-record-contracts";
import {
  hostSessionDetailQuery,
  hostSessionTrashDetailQuery,
  hostSessionClosingStatusQuery,
  invalidateHostSessionRecordSurfaces,
  isHostSessionNotFoundError,
  publishHostPublicConvergence,
} from "@/features/host/queries/host-session-queries";
import {
  hostPublicConvergenceQuery,
  useRetryHostPublicConvergenceMutation,
} from "@/features/host/queries/host-session-queries";
import { buildPublicConvergenceStatus } from "@/features/host/model/public-convergence-model";
import { hostSessionRecordEditorQuery, hostSessionRecordHistoryQuery, publishRestoredHostSessionRevisionDraft, useRestoreHostSessionRevisionToDraftMutation } from "@/features/host/queries/host-session-record-queries";
import { hostSessionRestorePreviewQuery, publishRestoredHostSessionChange, useRestoreHostSessionChangeMutation } from "@/features/host/queries/host-session-recovery-queries";
import { useHostMeetingPanelQueries, type PanelLoadState } from "@/features/host/queries/host-meeting-panel-queries";
import { registerHostSensitiveState } from "@/features/host/storage/host-sensitive-storage";
import { SessionHistoryPanel } from "@/features/host/ui/session-editor/session-history-panel";
import { HostSessionNotificationActions } from "@/features/host/ui/session-editor/session-editor-notifications";
import { SessionLifecycleConfirmDialog } from "@/features/host/ui/session-editor/session-lifecycle-confirm-dialog";
import { type WorkspacePendingUndo, type WorkspaceUndoConfirm } from "@/features/host/ui/session-workspace/workspace-undo-bar";
import {
  buildHostSessionRestorePreviewItemView,
  hostSessionRestoreBlockedExplanation,
} from "@/features/host/model/host-session-editor-view-model";
import { wrapHostSessionEditorActionsForUndo } from "@/features/host/route/host-session-editor-actions";
import {
  lifecycleConfirmCopy,
  reverseLifecycleAction,
  type SessionLifecycleConfirmKind,
} from "@/features/host/model/host-session-lifecycle-model";
import { buildHostMeetingDiary } from "@/features/host/model/host-meeting-diary-model";
import { getSessionClosingBoardView } from "@/features/host/model/session-closing-model";
import { HostMeetingWorkspace } from "@/features/host/ui/meeting-workspace/host-meeting-workspace";
import { buildMeetingAudienceProjections } from "@/features/host/ui/meeting-workspace/meeting-audience-projections";
import { MeetingRelatedWork } from "@/features/host/ui/meeting-workspace/meeting-related-work";
import { MeetingNotificationWorkspace } from "@/features/host/ui/meeting-workspace/meeting-notification-workspace";
import { MeetingNotificationRail } from "@/features/host/ui/meeting-workspace/meeting-notification-rail";
import {
  MeetingResponseLedger,
  type MeetingAttendance,
} from "@/features/host/ui/meeting-workspace/meeting-response-ledger";
import {
  meetingDayAttendanceWriteStateFromError,
  meetingResponseLedgerRowsFromAttendees,
  patchMeetingDayAttendanceWriteStates,
  type MeetingDayAttendanceWriteState,
} from "@/features/host/ui/meeting-workspace/meeting-response-ledger-rows";
import { buildComposerSelection } from "@/features/host/model/host-notification-composer-model";
import type { ManualNotificationOptionsResponse, ManualNotificationPreviewResponse } from "@/features/host/model/host-view-types";
import {
  hostNotificationManualDispatchesQuery,
  hostNotificationManualOptionsQuery,
  hostNotificationPolicyQuery,
  publishHostNotificationPolicy,
  publishManualNotificationConfirm,
  useConfirmManualNotificationMutation,
  usePreviewManualNotificationMutation,
  useUpdateHostNotificationPolicyMutation,
} from "@/features/host/queries/host-notification-queries";
import { publishTransitionAction, TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";
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
  if (location.task === "responses") return { panel: "responses" as const, source: "manual" as const };
  if (location.task === "attendance") return { panel: "attendance" as const, source: "manual" as const };
  if (location.task === "records") return { panel: "records" as const, source: location.recordSource };
  if (location.task === "notifications") return { panel: "notifications" as const, source: "manual" as const };
  if (location.task === "history") return { panel: "history" as const, source: "manual" as const };
  return { panel: "focus" as const, source: "manual" as const };
}

function panelKey(location: HostMeetingLocation): "focus" | "basic" | HostMeetingTask {
  if (location.overviewEditOpen) return "basic";
  if (location.task === "overview") return "focus";
  return location.task;
}

function isOverlayLocation(location: HostMeetingLocation) {
  return panelKey(location) !== "focus";
}

function overviewMeetingLocation(): HostMeetingLocation {
  return { task: "overview", overviewEditOpen: false, recordSource: "manual" };
}

function meetingLocationFromCompatibility(
  current: HostMeetingLocation,
  next: ReturnType<typeof compatibilityLocation>,
): HostMeetingLocation {
  if (next.panel === "basic") return { task: "overview", overviewEditOpen: true, recordSource: "manual" };
  if (next.panel === "responses") return { task: "responses", overviewEditOpen: false, recordSource: "manual" };
  if (next.panel === "attendance") return { task: "attendance", overviewEditOpen: false, recordSource: "manual" };
  if (next.panel === "records") return { task: "records", overviewEditOpen: false, recordSource: next.source };
  if (next.panel === "notifications") return { task: "notifications", overviewEditOpen: false, recordSource: "manual" };
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


function mapAttendanceToLedger(
  status: "UNKNOWN" | "ATTENDED" | "ABSENT",
): MeetingAttendance {
  if (status === "ATTENDED") return "ATTENDED";
  if (status === "ABSENT") return "ABSENT";
  return "UNKNOWN";
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
  const transitionOwner = useTransitionSafetyOwner("host-meeting-workspace");
  const runAccepted = useCallback(async <T,>(
    operationId: string,
    recoveryClass: "L1" | "L2" | "L3",
    request: () => Promise<T>,
    publish: (result: T) => Promise<unknown>,
  ) => {
    const handle = transitionOwner.begin(operationId, recoveryClass, async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const result = await request();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      await publishTransitionAction(handle, "cache", () => publish(result));
      return result;
    } catch (error) {
      if (!(error instanceof TransitionOwnerObsoleteError)) await handle.settle("failed");
      throw error;
    }
  }, [transitionOwner]);
  const currentUrl = `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`;
  const meetingLocation = useMemo(
    () => parseHostMeetingLocation(routerLocation.search),
    [routerLocation.search],
  );
  const originatingFocusRef = useRef<HTMLElement | null>(null);
  const previousPanelRef = useRef(panelKey(meetingLocation));
  const overlayPushedRef = useRef(false);
  useEffect(() => {
    const canonicalHref = canonicalizeLegacyHostMeetingUrl(currentUrl);
    if (canonicalHref && canonicalHref !== currentUrl) {
      void navigate(canonicalHref, { replace: true, state: routerLocation.state });
    }
  }, [currentUrl, navigate, routerLocation.state]);
  const captureOriginatingFocus = useCallback(() => {
    if (isOverlayLocation(meetingLocation)) return;
    if (document.activeElement instanceof HTMLElement) {
      originatingFocusRef.current = document.activeElement;
    }
  }, [meetingLocation]);
  const changeMeetingLocation = useCallback((next: HostMeetingLocation, options?: { close?: boolean }) => {
    const href = buildHostMeetingUrl(currentUrl, next);
    if (options?.close) {
      const shouldPop = overlayPushedRef.current;
      overlayPushedRef.current = false;
      if (shouldPop) {
        void navigate(-1);
        return;
      }
      if (href === currentUrl) return;
      void navigate(href, { replace: true, state: routerLocation.state });
      return;
    }
    if (href === currentUrl) return;
    const opening = isOverlayLocation(next) && !isOverlayLocation(meetingLocation);
    const switchingOverlay = isOverlayLocation(next) && isOverlayLocation(meetingLocation);
    if (opening) overlayPushedRef.current = true;
    if (!isOverlayLocation(next)) overlayPushedRef.current = false;
    void navigate(href, {
      replace: switchingOverlay || !opening,
      state: routerLocation.state,
    });
  }, [currentUrl, meetingLocation, navigate, routerLocation.state]);
  const closeMeetingPanel = useCallback(() => {
    changeMeetingLocation(overviewMeetingLocation(), { close: true });
  }, [changeMeetingLocation]);
  const navigation = useMemo(() => ({
    location: compatibilityLocation(meetingLocation),
    onChange: (next: ReturnType<typeof compatibilityLocation>) => {
      if (next.panel === "focus") {
        closeMeetingPanel();
        return;
      }
      changeMeetingLocation(meetingLocationFromCompatibility(meetingLocation, next));
    },
  }), [changeMeetingLocation, closeMeetingPanel, meetingLocation]);
  useEffect(() => {
    const nextPanel = panelKey(meetingLocation);
    const previousPanel = previousPanelRef.current;
    previousPanelRef.current = nextPanel;
    if (previousPanel === "focus" && nextPanel !== "focus") {
      if (!originatingFocusRef.current && document.activeElement instanceof HTMLElement) {
        originatingFocusRef.current = document.activeElement;
      }
      return;
    }
    if (previousPanel !== "focus" && nextPanel === "focus") {
      overlayPushedRef.current = false;
      const fallback = document.querySelector<HTMLElement>(
        `[aria-controls="workspace-panel-${previousPanel}"]`,
      );
      const target = originatingFocusRef.current ?? fallback;
      originatingFocusRef.current = null;
      let remainingFrames = 10;
      let frame = 0;
      const focusTrigger = () => {
        if (target?.isConnected) {
          target.focus();
          return;
        }
        remainingFrames -= 1;
        if (remainingFrames > 0) frame = requestAnimationFrame(focusTrigger);
      };
      frame = requestAnimationFrame(focusTrigger);
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [meetingLocation]);

  const [pendingUndo, setPendingUndo] = useState<{
    routeIdentity: string;
    receipt: HostSessionChangeReceipt;
    description: string;
    error: string | null;
    sessionState?: HostSessionDetailResponse["state"];
  } | null>(null);

  const handleSessionRecordsChanged = useCallback(async (changedSessionId: string) => {
    await Promise.all([
      invalidateHostSessionRecordSurfaces(queryClient, changedSessionId, context),
      onSessionRecordsChanged?.({ sessionId: changedSessionId, clubSlug }),
    ]);
  }, [clubSlug, context, onSessionRecordsChanged, queryClient]);
  const actions = useHostMeetingWorkspaceActions(context, handleSessionRecordsChanged);
  const captureChangeReceipt = useCallback((
    receipt: HostSessionChangeReceipt,
    description: string,
    sessionState?: HostSessionDetailResponse["state"],
  ) => {
    if (!receipt.undoAvailable) {
      setPendingUndo(null);
      return;
    }
    setPendingUndo({
      routeIdentity: `${context.clubSlug}:${sessionId}`,
      receipt,
      description,
      error: null,
      sessionState,
    });
  }, [context.clubSlug, sessionId]);
  const editorActions = useMemo(
    () => wrapHostSessionEditorActionsForUndo(actions, captureChangeReceipt),
    [actions, captureChangeReceipt],
  );
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
  const closingStatusQuery = useQuery({
    ...hostSessionClosingStatusQuery(sessionId, context),
    enabled: loaderData.mode === "active" && baseQuery.data?.state === "CLOSED",
  });
  const notificationSessionId = loaderData.mode === "active" ? sessionId : "";
  const notificationQueriesEnabled = loaderData.mode === "active" && Boolean(baseQuery.data);
  const [notificationPreview, setNotificationPreview] = useState<ManualNotificationPreviewResponse | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationOptions, setNotificationOptions] = useState<ManualNotificationOptionsResponse | null>(null);
  const [notificationMemberSearch, setNotificationMemberSearch] = useState("");
  const policyQuery = useQuery({
    ...hostNotificationPolicyQuery(context),
    enabled: notificationQueriesEnabled,
  });
  const reminderDispatchesQuery = useQuery({
    ...hostNotificationManualDispatchesQuery({
      sessionId: notificationSessionId,
      eventType: "SESSION_REMINDER_DUE",
      page: { limit: 20 },
    }, context),
    enabled: notificationQueriesEnabled && Boolean(notificationSessionId),
  });
  const manualOptionsQuery = useQuery({
    ...hostNotificationManualOptionsQuery({
      sessionId: notificationSessionId,
      search: notificationMemberSearch || null,
      page: { limit: 50 },
    }, context),
    enabled: notificationQueriesEnabled && Boolean(notificationSessionId),
  });
  const updatePolicyMutation = useUpdateHostNotificationPolicyMutation(context);
  const previewManualMutation = usePreviewManualNotificationMutation(context);
  const confirmManualMutation = useConfirmManualNotificationMutation(context);

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
    kind: SessionLifecycleConfirmKind;
  } | null>(null);
  const [lifecycleSubmitting, setLifecycleSubmitting] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const lifecycleRestoreFocusRef = useRef<HTMLElement | null>(null);
  const measuredRouteIdentityRef = useRef<string | null>(null);
  const editorPrimaryActionRef = useRef<(() => void) | null>(null);
  const [attendanceWriteStates, setAttendanceWriteStates] = useState<
    ReadonlyMap<string, MeetingDayAttendanceWriteState>
  >(() => new Map());

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
        setPendingUndo(null);
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
    const loadingDiary = buildHostMeetingDiary({
      workspace: loadingView,
      meetingDate: "",
      today: todayIsoDate(),
      currentUrl,
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
        diary={loadingDiary}
        header={{ sessionNumber: null, title: "모임" }}
        facts={loadingView.facts}
        relatedWork={<MeetingRelatedWork tasks={loadingView.relatedTasks} LinkComponent={LinkComponent} />}
        memberViewHref={sessionId
          ? `/app/sessions/${encodeURIComponent(sessionId)}`
          : null}
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
  const diary = buildHostMeetingDiary({
    workspace,
    meetingDate: session.date,
    today: todayIsoDate(),
    currentUrl,
  });
  const closingChecklist = session.state === "CLOSED"
    ? closingStatusQuery.data
      ? { kind: "ready" as const, view: getSessionClosingBoardView(closingStatusQuery.data) }
      : closingStatusQuery.isError
        ? {
          kind: "unavailable" as const,
          onRetry: () => {
            void closingStatusQuery.refetch();
          },
        }
        : { kind: "loading" as const }
    : null;

  const responseRows = meetingResponseLedgerRowsFromAttendees(
    activeAttendees.map((attendee) => ({
      membershipId: attendee.membershipId,
      displayName: attendee.displayName,
      accountName: attendee.accountName,
      rsvpStatus: attendee.rsvpStatus,
      attendanceStatus: mapAttendanceToLedger(attendee.attendanceStatus),
      attendanceRevision: attendee.attendanceRevision,
      participationStatus: attendee.participationStatus,
    })),
    attendanceWriteStates,
  );
  const showNotificationRail = diary.currentStep === "prepare" || diary.currentStep === "responses";
  const notificationWorkbenchHref = `/app/host/notifications?${new URLSearchParams({
    sessionId,
    eventType: "SESSION_REMINDER_DUE",
  }).toString()}`;
  const notificationRail = showNotificationRail ? (
    <MeetingNotificationRail
      policy={policyQuery.data}
      policyPending={updatePolicyMutation.isPending}
      policyLoading={policyQuery.isFetching && !policyQuery.data}
      policyError={
        policyQuery.isError && !policyQuery.data
          ? "자동 리마인더 정책을 불러오지 못했습니다."
          : null
      }
      onPolicyChange={async (enabled) => {
        await runAccepted(
          `host-notification-policy:${sessionId}`,
          "L3",
          () => updatePolicyMutation.mutateAsync({ sessionReminderEnabled: enabled }),
          (policy) => publishHostNotificationPolicy(queryClient, context, policy),
        );
      }}
      dispatches={reminderDispatchesQuery.data?.items ?? []}
      responseRows={responseRows}
      options={notificationOptions ?? manualOptionsQuery.data ?? null}
      workbenchHref={notificationWorkbenchHref}
      busy={
        previewManualMutation.isPending
        || confirmManualMutation.isPending
        || manualOptionsQuery.isFetching
      }
      error={notificationError}
      preview={notificationPreview}
      onSearch={async (search) => {
        setNotificationMemberSearch(search);
        const next = await queryClient.fetchQuery(hostNotificationManualOptionsQuery({
          sessionId,
          search: search || null,
          page: { limit: 50 },
        }, context));
        setNotificationOptions(next);
      }}
      onLoadMore={async () => {
        const cursor = notificationOptions?.members.nextCursor;
        if (!cursor) return;
        const next = await queryClient.fetchQuery(hostNotificationManualOptionsQuery({
          sessionId,
          search: notificationMemberSearch || null,
          page: { limit: 50, cursor },
        }, context));
        setNotificationOptions((current) => {
          if (!current) return next;
          const byId = new Map(current.members.items.map((item) => [item.membershipId, item]));
          next.members.items.forEach((item) => byId.set(item.membershipId, item));
          return {
            ...next,
            members: {
              items: Array.from(byId.values()),
              nextCursor: next.members.nextCursor,
            },
          };
        });
      }}
      onPreview={async (draft) => {
        setNotificationError(null);
        try {
          await runAccepted(
            `host-notification-preview:${sessionId}`,
            "L3",
            () => previewManualMutation.mutateAsync(buildComposerSelection(draft)),
            async (accepted) => { setNotificationPreview(accepted); },
          );
        } catch (error) {
          if (error instanceof TransitionOwnerObsoleteError) return;
          setNotificationPreview(null);
          setNotificationError("미리보기를 만들지 못했습니다. 대상과 채널을 확인해 주세요.");
        }
      }}
      onConfirm={async (draft, resendConfirmed) => {
        if (!notificationPreview) return;
        setNotificationError(null);
        try {
          await runAccepted(
            `host-notification-confirm:${notificationPreview.previewId}`,
            "L3",
            () => confirmManualMutation.mutateAsync({
              ...buildComposerSelection(draft),
              previewId: notificationPreview.previewId,
              resendConfirmed,
            }),
            async () => {
              await publishManualNotificationConfirm(queryClient, context);
              setNotificationPreview(null);
              await reminderDispatchesQuery.refetch();
            },
          );
        } catch (error) {
          if (error instanceof TransitionOwnerObsoleteError) return;
          setNotificationError("발송을 요청하지 못했습니다. 미리보기 만료 또는 재발송 여부를 확인해 주세요.");
        }
      }}
    />
  ) : null;

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
      await runAccepted(
        `host-session-restore-change:${sessionId}:${historyUndoConfirm.changeId}`,
        "L2",
        () => restoreChange.mutateAsync({
          sessionId,
          changeId: historyUndoConfirm.changeId,
          request: { expectedCurrentHash: historyUndoConfirm.expectedCurrentHash },
        }),
        () => publishRestoredHostSessionChange(queryClient, sessionId, context),
      );
      setHistoryUndoConfirm(null);
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) return;
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
      if (code === "HOST_SESSION_RESTORE_STALE" || (error && typeof error === "object" && "status" in error && error.status === 409)) {
        try {
          const previewQuery = hostSessionRestorePreviewQuery(
            sessionId,
            historyUndoConfirm.changeId,
            context,
          );
          queryClient.removeQueries({ queryKey: previewQuery.queryKey });
          const preview = await queryClient.fetchQuery({
            ...previewQuery,
            staleTime: 0,
          });
          if (!preview.canRestore) {
            setHistoryUndoConfirm(null);
            setHistoryRestoreNotice({
              routeIdentity,
              changeId: historyUndoConfirm.changeId,
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
            error: "되돌리지 못했습니다. 최신 변경 내역을 확인한 뒤 다시 시도해 주세요.",
            onConfirm: () => undefined,
            onCancel: () => undefined,
          });
          return;
        } catch {
          setHistoryUndoConfirm(null);
          setHistoryRestoreNotice({
            routeIdentity,
            changeId: historyUndoConfirm.changeId,
            message: "되돌릴 내용을 확인하지 못했습니다. 변경 내역에서 다시 시도해 주세요.",
          });
          return;
        }
      }
      setHistoryUndoConfirm((current) => current?.routeIdentity === routeIdentity ? {
        ...current,
        submitting: false,
        error: "되돌리지 못했습니다. 최신 변경 내역을 확인한 뒤 다시 시도해 주세요.",
      } : current);
    }
  };

  const requestLifecycle = (kind: SessionLifecycleConfirmKind) => {
    if (lifecycleSubmitting) return;
    lifecycleRestoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setLifecycleError(null);
    setLifecycleConfirm({ routeIdentity, kind });
  };

  const requestLifecycleReverse = () => {
    const reverse = reverseLifecycleAction(session.state);
    if (!reverse) return;
    requestLifecycle(reverse.kind);
  };

  const confirmLifecycleReverse = async (request?: HostSessionReverseRequest) => {
    if (!lifecycleConfirm || lifecycleConfirm.routeIdentity !== routeIdentity || lifecycleSubmitting) return;
    const needsReason = lifecycleConfirm.kind === "reopen"
      || lifecycleConfirm.kind === "unpublish"
      || lifecycleConfirm.kind === "return-to-draft";
    if (needsReason && !request) return;
    setLifecycleSubmitting(true);
    setLifecycleError(null);
    try {
      const result = lifecycleConfirm.kind === "reopen"
        ? await actions.reopenSession(sessionId, request)
        : lifecycleConfirm.kind === "unpublish"
          ? await actions.unpublishSession(sessionId, request)
          : lifecycleConfirm.kind === "return-to-draft"
            ? await actions.returnSessionToDraft(sessionId, request)
            : lifecycleConfirm.kind === "publish"
              ? await actions.publishSession(sessionId)
              : lifecycleConfirm.kind === "open"
                ? await actions.openSession(sessionId)
                : await actions.closeSession(sessionId);
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
        <SessionHistoryPanel
          key={`${routeIdentity}:${historySensitiveResetVersion}`}
          items={historyCleared ? [] : history.items}
          nextCursor={historyCleared ? null : history.nextCursor}
          expectedDraftRevision={historyAuthorityData?.draft?.draftRevision ?? null}
          restoring={restoreRevision.isPending || restoreChange.isPending || lifecycleSubmitting}
          recoveryActionsDisabled={recoveryActionsDisabled}
          onLoadMore={(cursor) => queryClient.fetchQuery(hostSessionRecordHistoryQuery(sessionId, { limit: 30, cursor }, context)).then(() => undefined)}
          onRestore={({ revisionId, expectedDraftRevision }) => runAccepted(
            `host-record:restore-revision:${sessionId}:${revisionId}`,
            "L2",
            () => restoreRevision.mutateAsync({ sessionId, revisionId, request: { expectedDraftRevision } }),
            (draft) => publishRestoredHostSessionRevisionDraft(queryClient, sessionId, context, draft),
          ).then(() => undefined)}
          onRestoreCompleted={() => changeMeetingLocation({ task: "records", overviewEditOpen: false, recordSource: "manual" })}
          onRestoreChange={(changeId) => startChangeRestore(changeId)}
          onReverseLifecycle={requestLifecycleReverse}
        />
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
      actions={editorActions}
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
  const pendingUndoView: WorkspacePendingUndo | null = pendingUndo?.routeIdentity === routeIdentity
    ? {
      description: pendingUndo.description,
      error: pendingUndo.error,
      onUndo: () => {
        void startChangeRestore(pendingUndo.receipt.changeId);
      },
      onOpenHistory: () => changeMeetingLocation({
        task: "history",
        overviewEditOpen: false,
        recordSource: "manual",
      }),
      onDismiss: () => setPendingUndo(null),
    }
    : null;
  const undoConfirmView = historyUndoConfirm?.routeIdentity === routeIdentity
    ? {
      items: historyUndoConfirm.items,
      submitting: historyUndoConfirm.submitting,
      error: historyUndoConfirm.error,
      onConfirm: () => void confirmChangeRestore(),
      onCancel: () => setHistoryUndoConfirm(null),
    }
    : null;
  const restoreNoticeView = historyRestoreNotice?.routeIdentity === routeIdentity
    ? {
      message: historyRestoreNotice.message,
      onRetry: () => void startChangeRestore(historyRestoreNotice.changeId),
      onOpenHistory: () => changeMeetingLocation({
        task: "history",
        overviewEditOpen: false,
        recordSource: "manual",
      }),
      onDismiss: () => setHistoryRestoreNotice(null),
    }
    : null;

  const commitMeetingDayAttendance = async (
    membershipIds: ReadonlyArray<string>,
    attendance: MeetingAttendance,
  ) => {
    if (membershipIds.length === 0) return;
    setAttendanceWriteStates((current) => patchMeetingDayAttendanceWriteStates(current, membershipIds, "saving"));
    try {
      await editorActions.updateAttendance(
        sessionId,
        membershipIds.map((membershipId) => ({
          membershipId,
          attendanceStatus: attendance,
        })),
      );
      setAttendanceWriteStates((current) => patchMeetingDayAttendanceWriteStates(current, membershipIds, null));
    } catch (error) {
      setAttendanceWriteStates((current) => patchMeetingDayAttendanceWriteStates(
        current,
        membershipIds,
        meetingDayAttendanceWriteStateFromError(error),
      ));
    }
  };

  const meetingDayAttendanceLedger = diary.currentStep === "meetingDay" ? (
    <MeetingResponseLedger
      presentation="meetingDay"
      rows={responseRows}
      onAttendanceChange={(membershipId, attendance) => {
        void commitMeetingDayAttendance([membershipId], attendance);
      }}
      onBulkAttendanceChange={(membershipIds, attendance) => {
        void commitMeetingDayAttendance(membershipIds, attendance);
      }}
      pendingUndo={pendingUndoView}
    />
  ) : null;

  const focusContent = (
    <>
      {meetingDayAttendanceLedger}
      {notificationRail}
    </>
  );

  return (
    <>
    <HostMeetingWorkspace
      view={{ ...workspace, primaryAction }}
      diary={diary}
      location={compatibilityLocation(meetingLocation)}
      onLocationChange={(next) => {
        captureOriginatingFocus();
        navigation.onChange(next);
      }}
      header={{
        sessionNumber: session.sessionNumber,
        title: session.title || session.bookTitle || "모임",
        date: session.date,
        time: session.startTime,
        location: session.locationLabel,
      }}
      facts={workspace.facts}
      closingChecklist={closingChecklist}
      focusContent={focusContent}
      relatedWork={(
        <MeetingRelatedWork
          tasks={workspace.relatedTasks}
          LinkComponent={LinkComponent}
          onOpenTask={(item) => {
            captureOriginatingFocus();
            changeMeetingLocation(parseHostMeetingLocation(new URL(item.href, "https://readmates.invalid").search));
          }}
        />
      )}
      projections={buildMeetingAudienceProjections({
        visibility: session.visibility,
        lifecycle: session.state,
      })}
      recordReadiness={recordReadiness}
      memberViewHref={`/app/sessions/${encodeURIComponent(session.sessionId)}`}
      publicRecordHref={session.state === "PUBLISHED"
        ? `/app/sessions/${encodeURIComponent(session.sessionId)}`
        : null}
      onCreateRevision={session.state === "PUBLISHED"
        ? () => changeMeetingLocation({ task: "records", overviewEditOpen: false, recordSource: "manual" })
        : null}
      reverseAction={reverse
        ? { label: reverse.label, onClick: requestLifecycleReverse }
        : null}
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
                if (convergenceId) void runAccepted(
                  `host-public-convergence:${sessionId}:${convergenceId}`,
                  "L3",
                  () => retryConvergence.mutateAsync({ sessionId, convergenceId }),
                  () => publishHostPublicConvergence(queryClient, sessionId, context),
                );
              }}
            >
              공개 캐시 회수 다시 시도
            </button>
          ) : null}
        </div>
      ) : null}
      onPrimaryAction={() => {
        if (workspace.primaryAction.kind === "OPEN_SESSION") {
          requestLifecycle("open");
          return;
        }
        if (workspace.primaryAction.kind === "FINISH_SESSION") {
          if (meetingLocation.task !== "overview") {
            closeMeetingPanel();
            return;
          }
          requestLifecycle("close");
          return;
        }
        if (workspace.primaryAction.kind === "PUBLISH_RECORD") {
          requestLifecycle("publish");
          return;
        }
        const recordSource = workspace.primaryAction.kind === "UPLOAD_RECORD"
          ? "json"
          : meetingLocation.recordSource;
        const alreadyThere = meetingLocation.task === workspace.primaryAction.task
          && (workspace.primaryAction.kind !== "UPLOAD_RECORD" || meetingLocation.recordSource === "json");
        if (!alreadyThere) {
          changeMeetingLocation({
            task: workspace.primaryAction.task,
            overviewEditOpen: false,
            recordSource,
          });
          return;
        }
        editorPrimaryActionRef.current?.();
      }}
      onRetryReadiness={recordRetry}
      pendingUndo={diary.currentStep === "meetingDay" ? null : pendingUndoView}
      undoConfirm={undoConfirmView}
      restoreNotice={restoreNoticeView}
      LinkComponent={LinkComponent}
    />
    {lifecycleConfirm?.routeIdentity === routeIdentity ? (
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
}
