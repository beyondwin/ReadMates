import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useLocation, useNavigate, useParams } from "react-router";
import HostSessionEditor, { type HostSessionEditorLinkComponent } from "@/features/host/ui/host-session-editor";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import { buildHostMeetingWorkspace, type HostMeetingLocation, type HostMeetingTask } from "@/features/host/model/host-session-workspace-model";
import { buildHostMeetingUrl, canonicalizeLegacyHostMeetingUrl, parseHostMeetingLocation } from "@/features/host/model/host-session-workspace-navigation";
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
import {
  HostMeetingWorkspace,
  type MeetingPanelViewModel,
} from "@/features/host/ui/meeting-workspace/host-meeting-workspace";
import { MeetingNotificationWorkspace } from "@/features/host/ui/meeting-workspace/meeting-notification-workspace";
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
      <HostMeetingWorkspace
        identity={{
          title: "모임",
          lifecycle: "DRAFT",
          statusLabel: "모임 정보를 확인하는 중",
        }}
        activeTask={meetingLocation.task}
        tasks={buildHostMeetingWorkspace({
          currentUrl,
          state: "DRAFT",
          meetingDate: "",
          today: todayIsoDate(),
          unansweredResponseCount: 0,
          unknownAttendanceCount: 0,
          hasRecordDraft: false,
          recordDraftStale: false,
          recordValidationIssueCount: 0,
          hasAppliedRecord: false,
          publicationReady: false,
        }).tasks}
        primaryAction={{ kind: "LOADING", label: "모임 확인 중", disabled: true }}
        panel={baseQuery.isError
          ? { kind: "unavailable", task: meetingLocation.task }
          : { kind: "loading", task: meetingLocation.task }}
        judgment={{
          title: "현재 상태",
          summary: "권한과 모임 상태를 확인한 뒤 안전한 작업을 표시합니다.",
          checks: [],
          projections: [
            { audience: "호스트", result: "확인 중" },
            { audience: "게스트·멤버", result: "확인 중" },
            { audience: "공개 기록", result: "확인 중" },
          ],
        }}
        announcements={[]}
        LinkComponent={LinkComponent}
        onTaskLinkActivated={() => undefined}
        onPrimaryAction={() => undefined}
        onRetryPanel={() => void baseQuery.refetch()}
      />
    );
  }

  const session = baseQuery.data;
  const recordData = panelStates.record.kind === "ready" || panelStates.record.kind === "stale-cached"
    ? panelStates.record.data
    : null;
  const activeAttendees = session.attendees.filter((item) => (item.participationStatus ?? "ACTIVE") === "ACTIVE");
  const unknownAttendanceCount = activeAttendees.filter((item) => item.attendanceStatus === "UNKNOWN").length;
  const workspace = buildHostMeetingWorkspace({
    currentUrl,
    state: session.state,
    meetingDate: session.date,
    today: todayIsoDate(),
    unansweredResponseCount: activeAttendees.filter((item) => item.rsvpStatus === "NO_RESPONSE").length,
    unknownAttendanceCount,
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
        embeddedInMeetingFolio
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
    <HostSessionEditor
      embeddedInMeetingFolio
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

  const guestMemberProjection = session.visibility === "HOST_ONLY"
    ? "호스트만 확인"
    : session.state === "PUBLISHED"
      ? "게스트·멤버 노트에서 읽음"
      : "허용된 아카이브에서 읽음";
  const publicProjection = session.visibility === "PUBLIC" && session.state === "PUBLISHED"
    ? "공개 기록에 게시"
    : "공개 기록에 게시 안 됨";
  const primaryAction = {
    kind: workspace.primaryAction.kind,
    label: workspace.primaryAction.label,
    disabled: baseQuery.isFetching || baseQuery.isError,
    reason: baseQuery.isFetching ? "최신 모임 상태를 확인하고 있습니다." : null,
  };

  return (
    <HostMeetingWorkspace
      identity={{
        title: session.title || session.bookTitle || "모임",
        bookTitle: session.title ? session.bookTitle : null,
        number: session.sessionNumber,
        lifecycle: session.state,
        statusLabel: workspace.statusLabel,
        dateLabel: [session.date, session.startTime].filter(Boolean).join(" · "),
        locationLabel: session.locationLabel,
      }}
      activeTask={meetingLocation.task}
      tasks={workspace.tasks}
      LinkComponent={LinkComponent}
      primaryAction={primaryAction}
      panel={resolvedPanel}
      judgment={{
        title: meetingLocation.task === "records" ? "반영 전 확인" : "지금 확인할 일",
        summary: session.state === "PUBLISHED"
          ? "게시된 기록은 기존 독자 표면을 유지한 채 수정본으로 교체합니다."
          : "모임 상태와 노출 결과를 따로 확인한 뒤 현재 작업을 실행합니다.",
        checks: [
          ...(unknownAttendanceCount > 0 ? [`실제 출석 확인 전 ${unknownAttendanceCount}명`] : []),
          "알림은 자동으로 보내지 않음",
          ...(recordData?.draftLiveBaseStale ? ["현재 기록과 초안의 기준 버전이 다름"] : []),
        ],
        projections: [
          { audience: "호스트", result: "운영 기록과 초안 계속 편집" },
          { audience: "게스트·멤버", result: guestMemberProjection },
          { audience: "공개 기록", result: publicProjection },
        ],
      }}
      announcements={[]}
      onTaskLinkActivated={() => undefined}
      onPrimaryAction={() => {
        if (meetingLocation.task !== workspace.primaryAction.task) {
          changeMeetingLocation({ task: workspace.primaryAction.task, overviewEditOpen: false, recordSource: "manual" });
          return;
        }
        document.querySelector<HTMLButtonElement>(".rm-meeting-folio__work .rm-host-session-workspace__cta--desktop")?.click();
      }}
      onRetryPanel={() => {
        if (panel?.kind === "unavailable" || panel?.kind === "stale-cached") panel.retry();
      }}
    />
  );
}
