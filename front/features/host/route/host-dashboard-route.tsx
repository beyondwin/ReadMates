import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useLoaderData,
  useLocation,
  useNavigate,
  useParams,
  useRevalidator,
} from "react-router";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import type { HostSessionChangeReceipt } from "@/features/host/api/host-session-recovery-contracts";
import type { HostWorkboxState } from "@/features/host/api/host-workbox-contracts";
import type { HostWorkboxItem } from "@/features/host/api/host-workbox-contracts";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import { mergeCoherentWorkboxPages } from "@/features/host/model/host-workbox-page-chain";
import {
  buildClosingPhaseStatusRows,
  buildHostOperatingRoomView,
  buildLivePhaseStatusRows,
  type HostMeetingPhase,
  type HostAuthoritativeWorkItem,
  type HostOperatingRoomSource,
  type HostOperatingRoomView,
} from "@/features/host/model/host-operating-room-model";
import { buildHostWorkboxDisclosure, buildHostWorkboxView, buildWorkboxFooterNote } from "@/features/host/model/host-workbox-model";
import type { SessionClosingStatusInput } from "@/features/host/model/session-closing-model";
import {
  hostSessionChangeUndoDescription,
  hostSessionRestoreBlockedExplanation,
} from "@/features/host/model/host-session-editor-view-model";
import {
  HostMutationPendingError,
  hostSessionDetailQuery,
  publishHostSessionAttendance,
  useUpdateHostSessionAttendanceMutation,
} from "@/features/host/queries/host-session-queries";
import {
  hostSessionRestorePreviewQuery,
  publishRestoredHostSessionChange,
  useRestoreHostSessionChangeMutation,
} from "@/features/host/queries/host-session-recovery-queries";
import { hostNotificationHealthQuery } from "@/features/host/queries/host-notification-queries";
import {
  hostWorkboxPageQuery,
  publishHostWorkboxComposition,
  useDeferHostWorkboxItemMutation,
  useRemoveHostWorkboxDeferralMutation,
} from "@/features/host/queries/host-workbox-queries";
import { registerHostSensitiveState } from "@/features/host/storage/host-sensitive-storage";
import type { HostLinkComponent } from "@/features/host/ui/host-link-types";
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
import {
  HostOperatingRoomPage,
  type AttendanceRecoveryView,
} from "@/features/host/ui/operating-room/host-operating-room-page";
import type { CurrentMeetingBadge } from "@/features/host/ui/operating-room/current-meeting-header";
import { PhaseStatusLedger } from "@/features/host/ui/operating-room/phase-status-ledger";
import { useOperatingRoomCompactViewport } from "@/features/host/ui/operating-room/use-operating-room-compact-viewport";
import { HostWorkbox } from "@/features/host/ui/workbox/host-workbox";
import type { HostWorkboxDeferralOption } from "@/features/host/ui/workbox/host-work-item";
import type { WorkspacePendingUndo } from "@/features/host/ui/session-workspace/workspace-undo-bar";
import { WorkspaceUndoBar } from "@/features/host/ui/session-workspace/workspace-undo-bar";
import { formatSessionKicker } from "@/shared/ui/readmates-display";
import { publishTransitionAction, TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";
import type { HostDashboardRouteData } from "./host-dashboard-data";

const PHASE_REASON_STATE_KEY = "hostOperatingRoomPhaseReason";

type AttendanceAttempt = {
  sessionId: string;
  membershipIds: readonly string[];
  attendance: MeetingAttendance;
};

type AttendanceConflict = AttendanceAttempt & {
  canonicalLabel: string;
};

type AttendanceUnknown = AttendanceAttempt & {
  canonicalLabel: string | null;
};

type AttendanceWriteStateScope = {
  sessionId: string;
  values: ReadonlyMap<string, MeetingDayAttendanceWriteState>;
};

type HostRoutePaths = {
  appBasePath: string;
  hostBasePath: string;
  newMeetingHref: string;
};

function DefaultLink({
  to,
  children,
  state: _state,
  ...props
}: {
  to: string;
  className?: string;
  state?: unknown;
  children: ReactNode;
  "aria-label"?: string;
}) {
  void _state;
  return <a {...props} href={to}>{children}</a>;
}

export function HostDashboardRoute({
  LinkComponent = DefaultLink,
}: {
  auth?: AuthMeResponse;
  LinkComponent?: HostLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
  const loaderData = useLoaderData() as HostDashboardRouteData;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => requireHostClubContext(clubSlug), [clubSlug]);
  const paths = useMemo(() => hostRoutePaths(context.clubSlug), [context.clubSlug]);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const sessionId = loaderData.operatingRoom.currentMeeting?.sessionId ?? null;
  const [workboxState, setWorkboxState] = useState<HostWorkboxState>("NOW");
  const [workboxCursors, setWorkboxCursors] = useState<readonly (string | null)[]>([null]);
  const [workboxGeneration, setWorkboxGeneration] = useState<string | null>(null);
  const [workboxPendingKey, setWorkboxPendingKey] = useState<string | null>(null);
  const workboxMutationKeyRef = useRef<string | null>(null);
  const [workboxRowError, setWorkboxRowError] = useState<{ key: string; message: string } | null>(null);
  const [notificationRetry, setNotificationRetry] = useState<{
    failureKey: string;
    state: "retrying" | "recovered";
  } | null>(null);

  const nowWorkboxQuery = useQuery({
    ...hostWorkboxPageQuery({ state: "NOW", limit: 20 }, context),
    retry: false,
  });
  const workboxQueries = useQueries({
    queries: workboxCursors.map((cursor) => ({
      ...hostWorkboxPageQuery({ state: workboxState, cursor, limit: 20 }, context),
      retry: false,
    })),
  });
  const rootWorkboxPage = workboxQueries[0]?.data?.state === workboxState
    ? workboxQueries[0].data
    : undefined;
  const nextWorkboxGeneration = rootWorkboxPage
    ? `${workboxState}:${rootWorkboxPage.evaluatedAt}`
    : null;
  if (workboxGeneration !== nextWorkboxGeneration) {
    setWorkboxGeneration(nextWorkboxGeneration);
    setWorkboxCursors([null]);
  }
  const deferWorkboxMutation = useDeferHostWorkboxItemMutation(context);
  const removeWorkboxDeferralMutation = useRemoveHostWorkboxDeferralMutation(context);

  const detailQuery = useQuery({
    ...hostSessionDetailQuery(sessionId ?? "", context),
    enabled: Boolean(sessionId),
    initialData: loaderData.currentMeeting ?? undefined,
    retry: false,
  });
  const attendanceMutation = useUpdateHostSessionAttendanceMutation(context);
  const restoreMutation = useRestoreHostSessionChangeMutation(context);
  const transitionOwner = useTransitionSafetyOwner(`host-operating-room:${sessionId ?? "empty"}`);
  const [detailOverride, setDetailOverride] = useState<{
    sessionId: string;
    detail: HostSessionDetailResponse;
  } | null>(null);
  const [attendanceWriteStates, setAttendanceWriteStates] = useState<AttendanceWriteStateScope | null>(null);
  const [attendanceConflict, setAttendanceConflict] = useState<AttendanceConflict | null>(null);
  const [attendanceUnknown, setAttendanceUnknown] = useState<AttendanceUnknown | null>(null);
  const [attendanceMutationSessionId, setAttendanceMutationSessionId] = useState<string | null>(null);
  const [pendingAttendanceUndo, setPendingAttendanceUndo] = useState<{
    sessionId: string;
    receipt: HostSessionChangeReceipt;
    description: string;
    error: string | null;
  } | null>(null);
  const resetAttendanceMutation = attendanceMutation.reset;
  const resetRestoreMutation = restoreMutation.reset;
  const currentSessionIdRef = useRef(sessionId);

  useLayoutEffect(() => {
    currentSessionIdRef.current = sessionId;
  }, [sessionId]);

  const activeAttendanceWriteStates = attendanceWriteStates?.sessionId === sessionId
    ? attendanceWriteStates.values
    : new Map<string, MeetingDayAttendanceWriteState>();
  const activeAttendanceConflict = attendanceConflict?.sessionId === sessionId
    ? attendanceConflict
    : null;
  const activeAttendanceUnknown = attendanceUnknown?.sessionId === sessionId
    ? attendanceUnknown
    : null;

  useEffect(() => registerHostSensitiveState({
    clubSlug: context.clubSlug,
    resourceKey: `reconciliation:operating-room:${sessionId ?? "empty"}`,
    clear: () => {
      setAttendanceConflict(null);
      setAttendanceUnknown(null);
      setPendingAttendanceUndo(null);
      setAttendanceWriteStates(null);
      setAttendanceMutationSessionId(null);
      resetAttendanceMutation();
      resetRestoreMutation();
    },
  }), [
    context.clubSlug,
    resetAttendanceMutation,
    resetRestoreMutation,
    sessionId,
  ]);

  const selectedDetail = useMemo(() => {
    const detail = detailOverride?.sessionId === sessionId
      ? detailOverride.detail
      : detailQuery.data ?? loaderData.currentMeeting;
    if (!detail || !loaderData.operatingRoom.currentMeeting) return detail;
    return {
      ...detail,
      scheduleSeenAvailability: loaderData.operatingRoom.currentMeeting.scheduleSeenAvailability,
    };
  }, [detailOverride, detailQuery.data, loaderData.currentMeeting, loaderData.operatingRoom.currentMeeting, sessionId]);

  const compactViewport = useOperatingRoomCompactViewport();
  const requestedPhase = useMemo(
    () => new URLSearchParams(location.search).get("phase"),
    [location.search],
  );
  const workboxExpanded = useMemo(
    () => new URLSearchParams(location.search).get("workbox") === "all",
    [location.search],
  );
  const closingSource = useMemo(
    () => closingSourceFromLoader(loaderData),
    [loaderData],
  );
  const baseView = useMemo(() => buildHostOperatingRoomView({
    currentMeeting: selectedDetail ?? null,
    requestedPhase,
    today: todayIsoDate(),
    basePath: paths.hostBasePath,
    questions: { state: "absent" },
    closing: closingSource,
    pendingOutcome: null,
    authoritativeWorkItems: authoritativeOperatingRoomItems(
      nowWorkboxQuery.data?.items,
      selectedDetail?.sessionId ?? null,
    ),
  }), [closingSource, nowWorkboxQuery.data?.items, paths.hostBasePath, requestedPhase, selectedDetail]);

  const resolvedView = useMemo<HostOperatingRoomView>(() => {
    if (activeAttendanceConflict) {
      return {
        ...baseView,
        nextAction: {
          kind: "attendance",
          state: "conflict",
          workItemKey: null,
          label: "출석 변경 비교",
          reason: "최신 출석과 보존한 내 선택을 확인한 뒤 다시 저장하세요.",
          href: null,
        },
      };
    }
    if (
      activeAttendanceUnknown
      || (
        attendanceMutation.reconciliationState !== "idle"
        && attendanceMutationSessionId === sessionId
      )
    ) {
      return {
        ...baseView,
        nextAction: {
          kind: "attendance",
          state: "unknown",
          workItemKey: null,
          label: "출석 변경 결과 확인",
          reason: "같은 요청을 다시 보내기 전에 최신 출석과 변경 내역을 확인해야 합니다.",
          href: sessionId ? hostSessionHref(paths.hostBasePath, sessionId, "?section=history") : null,
        },
      };
    }
    return baseView;
  }, [
    activeAttendanceConflict,
    activeAttendanceUnknown,
    attendanceMutationSessionId,
    attendanceMutation.reconciliationState,
    baseView,
    paths.hostBasePath,
    sessionId,
  ]);

  const view = resolvedView;

  const phaseHref = useCallback((phase: HostMeetingPhase) => {
    const search = new URLSearchParams(location.search);
    search.set("phase", phase);
    const query = search.toString();
    return `${location.pathname}${query ? `?${query}` : ""}${location.hash}`;
  }, [location.hash, location.pathname, location.search]);

  const showAllWorkbox = useCallback(() => {
    const search = new URLSearchParams(location.search);
    search.set("workbox", "all");
    const query = search.toString();
    void navigate(`${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (requestedPhase === view.phase || (!view.meeting && requestedPhase === null)) return;
    void navigate(phaseHref(view.phase), {
      replace: true,
      state: withPhaseReason(location.state, phaseNormalizationMessage(requestedPhase, view)),
    });
  }, [location.state, navigate, phaseHref, requestedPhase, view]);

  const refreshExactDetail = useCallback(async (
    expectedSessionId = sessionId,
  ): Promise<HostSessionDetailResponse | null> => {
    if (!expectedSessionId || currentSessionIdRef.current !== expectedSessionId) return null;
    const result = await detailQuery.refetch();
    const refreshed = result.data ?? null;
    if (
      !refreshed
      || refreshed.sessionId !== expectedSessionId
      || currentSessionIdRef.current !== expectedSessionId
    ) return null;
    setDetailOverride({ sessionId: expectedSessionId, detail: refreshed });
    return refreshed;
  }, [detailQuery, sessionId]);

  const setAttendanceWriteState = useCallback((
    expectedSessionId: string,
    membershipIds: readonly string[],
    state: MeetingDayAttendanceWriteState | null,
  ) => {
    if (currentSessionIdRef.current !== expectedSessionId) return;
    setAttendanceWriteStates((current) => ({
      sessionId: expectedSessionId,
      values: patchMeetingDayAttendanceWriteStates(
        current?.sessionId === expectedSessionId ? current.values : new Map(),
        membershipIds,
        state,
      ),
    }));
  }, []);

  const commitAttendance = useCallback(async (
    membershipIds: readonly string[],
    attendance: MeetingAttendance,
    expectedSessionId = sessionId,
  ) => {
    if (
      !expectedSessionId
      || currentSessionIdRef.current !== expectedSessionId
      || membershipIds.length === 0
    ) return;
    const attempt = { sessionId: expectedSessionId, membershipIds, attendance };
    setAttendanceMutationSessionId(expectedSessionId);
    setAttendanceConflict(null);
    setAttendanceUnknown(null);
    setAttendanceWriteState(expectedSessionId, membershipIds, "saving");
    const operationId = `host-attendance:${expectedSessionId}:${membershipIds.join(",")}`;
    const handle = transitionOwner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const attendanceEntries = membershipIds.map((membershipId) => ({
        membershipId,
        attendanceStatus: attendance,
      }));
      const result = await attendanceMutation.mutateAsync({
        sessionId: expectedSessionId,
        attendance: attendanceEntries,
      });
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      await publishTransitionAction(handle, "cache", () => publishHostSessionAttendance(queryClient, expectedSessionId, attendanceEntries, context));
      if (currentSessionIdRef.current !== expectedSessionId) return;
      const receipt = result.changeReceipt ?? null;
      await publishTransitionAction(handle, "ui", () => {
        setAttendanceWriteState(expectedSessionId, membershipIds, null);
        setPendingAttendanceUndo(receipt?.undoAvailable ? {
          sessionId: expectedSessionId,
          receipt,
          description: hostSessionChangeUndoDescription("ATTENDANCE"),
          error: null,
        } : null);
      });
    } catch (error) {
      if (!(error instanceof TransitionOwnerObsoleteError) && await handle.settle("failed") !== "accepted") return;
      if (currentSessionIdRef.current !== expectedSessionId) return;
      if (error instanceof TransitionOwnerObsoleteError) return;
      if (error instanceof HostMutationPendingError) {
        await publishTransitionAction(handle, "errorCopy", () => setAttendanceUnknown({ ...attempt, canonicalLabel: null }));
        return;
      }
      const writeState = meetingDayAttendanceWriteStateFromError(error);
      await publishTransitionAction(handle, "errorCopy", () => {
        setAttendanceWriteState(expectedSessionId, membershipIds, writeState);
      });
      if (writeState === "conflict") {
        const refreshed = await refreshExactDetail(expectedSessionId);
        if (currentSessionIdRef.current !== expectedSessionId) return;
        const nextConflict = {
          ...attempt,
          canonicalLabel: attendanceAttemptCanonicalLabel(refreshed, membershipIds),
        };
        try {
          await publishTransitionAction(handle, "errorCopy", () => {
            setAttendanceConflict(nextConflict);
          });
        } catch (publicationError) {
          if (!(publicationError instanceof TransitionOwnerObsoleteError)) throw publicationError;
          setAttendanceConflict(nextConflict);
        }
      }
    }
  }, [attendanceMutation, context, queryClient, refreshExactDetail, sessionId, setAttendanceWriteState, transitionOwner]);

  const reconcileUnknownAttendance = useCallback(async () => {
    const attempt = activeAttendanceUnknown;
    if (!attempt || currentSessionIdRef.current !== attempt.sessionId) return;
    const refreshed = await refreshExactDetail(attempt.sessionId);
    if (currentSessionIdRef.current !== attempt.sessionId) return;
    if (attendanceAttemptMatches(refreshed, attempt)) {
      setAttendanceWriteState(attempt.sessionId, attempt.membershipIds, null);
      setAttendanceUnknown((current) => current?.sessionId === attempt.sessionId ? null : current);
      return;
    }
    setAttendanceUnknown((current) => current?.sessionId === attempt.sessionId ? {
      ...current,
      canonicalLabel: attendanceAttemptCanonicalLabel(refreshed, current.membershipIds),
    } : current);
  }, [activeAttendanceUnknown, refreshExactDetail, setAttendanceWriteState]);

  const writeUndo: WorkspacePendingUndo | null = pendingAttendanceUndo && sessionId
    && pendingAttendanceUndo.sessionId === sessionId
    ? {
      description: pendingAttendanceUndo.description,
      undoLabel: "실행 취소",
      error: pendingAttendanceUndo.error,
      onUndo: () => {
        const current = pendingAttendanceUndo;
        void (async () => {
          try {
            if (currentSessionIdRef.current !== current.sessionId) return;
            const preview = await queryClient.fetchQuery(
              hostSessionRestorePreviewQuery(current.sessionId, current.receipt.changeId, context),
            );
            if (!preview.canRestore) {
              if (currentSessionIdRef.current !== current.sessionId) return;
              setPendingAttendanceUndo({
                ...current,
                error: hostSessionRestoreBlockedExplanation(preview.blockedReason),
              });
              return;
            }
            const operationId = `host-attendance-restore:${current.sessionId}:${preview.changeId}`;
            const handle = transitionOwner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
            try {
              await restoreMutation.mutateAsync({
                sessionId: current.sessionId,
                changeId: preview.changeId,
                request: { expectedCurrentHash: preview.expectedCurrentHash },
              });
            } catch {
              if (await handle.settle("failed") !== "accepted") return;
              await publishTransitionAction(handle, "errorCopy", () => {
                setPendingAttendanceUndo({
                  ...current,
                  error: "되돌리지 못했습니다. 변경 내역에서 다시 시도해 주세요.",
                });
              });
              return;
            }
            if (await handle.settle("succeeded") !== "accepted") return;
            await publishTransitionAction(handle, "cache", () => publishRestoredHostSessionChange(queryClient, current.sessionId, context));
            if (currentSessionIdRef.current !== current.sessionId) return;
            await publishTransitionAction(handle, "ui", () => setPendingAttendanceUndo(null));
          } catch (error) {
            if (error instanceof TransitionOwnerObsoleteError) return;
            if (currentSessionIdRef.current !== current.sessionId) return;
            setPendingAttendanceUndo({
              ...current,
              error: "되돌리지 못했습니다. 변경 내역에서 다시 시도해 주세요.",
            });
          }
        })();
      },
      onOpenHistory: () => {
        if (currentSessionIdRef.current !== sessionId) return;
        void navigate(hostSessionHref(paths.hostBasePath, sessionId, "?section=history"));
      },
      onDismiss: () => setPendingAttendanceUndo(null),
    }
    : null;
  const pendingUndo = writeUndo;

  const liveRows = selectedDetail
    ? buildLivePhaseStatusRows(selectedDetail, paths.hostBasePath)
    : [];
  const liveAgendaHref = liveRows.find((row) => row.label === "진행 순서")?.href ?? null;
  const liveContent = selectedDetail ? (
    <>
      {compactViewport ? null : <WorkspaceUndoBar pendingUndo={pendingUndo} />}
      <PhaseStatusLedger
        title="현장 현황"
        rows={liveRows}
        LinkComponent={LinkComponent}
      />
    </>
  ) : null;
  const compactAttendanceRows = selectedDetail
    ? meetingResponseLedgerRowsFromAttendees(selectedDetail.attendees, activeAttendanceWriteStates)
    : [];
  const compactAttendancePreview = compactAttendanceRows.slice(0, 1);
  const compactAttendanceCensus = {
    attended: compactAttendanceRows.filter((row) => row.attendance === "ATTENDED").length,
    all: compactAttendanceRows.length,
    pending: compactAttendanceRows.filter((row) => row.attendance === "UNKNOWN").length,
  };
  const compactLiveContent = selectedDetail ? (
    <>
      <MeetingResponseLedger
        presentation="attendanceBoard"
        agendaHref={hostSessionHref(paths.hostBasePath, selectedDetail.sessionId, "?section=agenda")}
        rows={compactAttendancePreview}
        attendanceCensus={compactAttendanceCensus}
        onAttendanceChange={(membershipId, attendance) => {
          void commitAttendance([membershipId], attendance);
        }}
        onBulkAttendanceChange={(membershipIds, attendance) => {
          void commitAttendance(membershipIds, attendance);
        }}
        pendingUndo={pendingUndo}
      />
      {compactAttendanceRows.length > compactAttendancePreview.length ? (
        <LinkComponent
          to={hostSessionHref(paths.hostBasePath, selectedDetail.sessionId, "?section=attendance")}
          className="rm-host-operating-room__attendance-disclose"
        >
          {`출석 ${compactAttendanceCensus.all}명 모두 보기`}
        </LinkComponent>
      ) : null}
    </>
  ) : null;

  const closingContent = view.closing ? (
    <PhaseStatusLedger
      title="마감 현황"
      rows={buildClosingPhaseStatusRows(view.closing)}
      LinkComponent={LinkComponent}
    />
  ) : (
    <p className="rm-host-operating-room__phase-state" role="alert">
      마감 상태를 불러오지 못했습니다. 준비된 다른 운영 정보는 그대로 유지됩니다.
    </p>
  );

  const optionalFailureMessages = uniqueFailureMessages(loaderData, view);
  const notificationFailure = loaderData.notificationHealth.state === "failed"
    ? loaderData.notificationHealth.error
    : null;
  const notificationFailureKey = notificationFailure
    ? `${context.clubSlug}:${notificationFailure.message}`
    : null;
  const notificationRecovered = notificationRetry?.failureKey === notificationFailureKey
    && notificationRetry.state === "recovered";
  const recovery: AttendanceRecoveryView | null = activeAttendanceConflict ? {
    kind: "conflict",
    intendedLabel: attendanceLabel(activeAttendanceConflict.attendance),
    canonicalLabel: activeAttendanceConflict.canonicalLabel,
    onRetry: () => {
      void commitAttendance(
        activeAttendanceConflict.membershipIds,
        activeAttendanceConflict.attendance,
        activeAttendanceConflict.sessionId,
      );
    },
  } : activeAttendanceUnknown ? {
    kind: "unknown",
    canonicalLabel: activeAttendanceUnknown.canonicalLabel,
    onReconcile: () => { void reconcileUnknownAttendance(); },
    historyHref: sessionId
      ? hostSessionHref(paths.hostBasePath, sessionId, "?section=history")
      : paths.hostBasePath,
  } : null;

  const headerLinks = view.meeting ? {
    infoHref: hostSessionHref(paths.hostBasePath, view.meeting.sessionId, "?section=basic"),
    scheduleHref: hostSessionHref(paths.hostBasePath, view.meeting.sessionId, "?section=basic&edit=1"),
    historyHref: hostSessionHref(paths.hostBasePath, view.meeting.sessionId, "?section=history"),
    previewHref: view.phase === "closing"
      ? hostSessionHref(paths.hostBasePath, view.meeting.sessionId, "?section=records")
      : null,
    memberViewHref: `${paths.appBasePath}/sessions/${encodeURIComponent(view.meeting.sessionId)}`,
  } : null;
  const phaseLinks = view.phases.map((phase) => ({ ...phase, href: phaseHref(phase.id) }));
  const badge = view.meeting
    ? currentMeetingBadge(view.phase, view.meeting, compactViewport)
    : null;
  const loadedWorkboxPage = useMemo(
    () => mergeCoherentWorkboxPages(
      rootWorkboxPage,
      workboxQueries.flatMap((query) => query.data?.state === workboxState ? [query.data] : []),
    ),
    [rootWorkboxPage, workboxQueries, workboxState],
  );
  const workboxView = loadedWorkboxPage ? buildHostWorkboxView(loadedWorkboxPage) : null;
  const workboxDisclosure = workboxView
    ? buildHostWorkboxDisclosure(workboxView, {
      limit: compactViewport ? 3 : 4,
      expanded: workboxExpanded,
    })
    : null;
  const workboxLoading = workboxQueries.some((query) => query.isPending || query.isFetching);
  const workboxError = workboxQueries.some((query) => query.isError);
  const retryWorkbox = useCallback(() => {
    void Promise.all(workboxQueries.map((query) => query.refetch()));
  }, [workboxQueries]);
  const workboxWarningActions = (workboxView?.partialWarnings ?? []).map((warning) => ({
    key: `workbox:${warning.type}`,
    message: warning.message,
    label: `${warning.operationalLabel} 다시 불러오기`,
    busy: workboxLoading,
    onRetry: retryWorkbox,
  }));

  const deferWorkItem = useCallback(async (
    workItemKey: string,
    option: HostWorkboxDeferralOption,
  ) => {
    if (workboxMutationKeyRef.current !== null) return;
    workboxMutationKeyRef.current = workItemKey;
    setWorkboxPendingKey(workItemKey);
    setWorkboxRowError(null);
    const operationId = `host-workbox:defer:${workItemKey}`;
    const handle = transitionOwner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      await deferWorkboxMutation.mutateAsync({
        key: workItemKey,
        deferredUntil: deferredUntilForOption(option),
      });
      if (await handle.settle("succeeded") !== "accepted") return;
      await publishTransitionAction(handle, "cache", () => publishHostWorkboxComposition(queryClient, context));
      await publishTransitionAction(handle, "ui", () => setWorkboxPendingKey((current) => current === workItemKey ? null : current));
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) return;
      if (await handle.settle("failed") !== "accepted") return;
      await publishTransitionAction(handle, "errorCopy", () => setWorkboxRowError({
        key: workItemKey,
        message: "작업을 보류하지 못했습니다. 항목을 유지한 채 다시 시도할 수 있습니다.",
      }));
      await publishTransitionAction(handle, "ui", () => setWorkboxPendingKey((current) => current === workItemKey ? null : current));
    } finally {
      if (workboxMutationKeyRef.current === workItemKey) {
        workboxMutationKeyRef.current = null;
      }
      handle.completePublication();
    }
  }, [context, deferWorkboxMutation, queryClient, transitionOwner]);

  const undoWorkItemDeferral = useCallback(async (workItemKey: string) => {
    if (workboxMutationKeyRef.current !== null) return;
    workboxMutationKeyRef.current = workItemKey;
    setWorkboxPendingKey(workItemKey);
    setWorkboxRowError(null);
    const operationId = `host-workbox:remove-deferral:${workItemKey}`;
    const handle = transitionOwner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      await removeWorkboxDeferralMutation.mutateAsync(workItemKey);
      if (await handle.settle("succeeded") !== "accepted") return;
      await publishTransitionAction(handle, "cache", () => publishHostWorkboxComposition(queryClient, context));
      await publishTransitionAction(handle, "ui", () => setWorkboxPendingKey((current) => current === workItemKey ? null : current));
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) return;
      if (await handle.settle("failed") !== "accepted") return;
      await publishTransitionAction(handle, "errorCopy", () => setWorkboxRowError({
        key: workItemKey,
        message: "보류를 해제하지 못했습니다. 항목을 유지한 채 다시 시도할 수 있습니다.",
      }));
      await publishTransitionAction(handle, "ui", () => setWorkboxPendingKey((current) => current === workItemKey ? null : current));
    } finally {
      if (workboxMutationKeyRef.current === workItemKey) {
        workboxMutationKeyRef.current = null;
      }
      handle.completePublication();
    }
  }, [context, queryClient, removeWorkboxDeferralMutation, transitionOwner]);

  const workboxFooterText = buildWorkboxFooterNote(workboxView?.items ?? []);
  const workboxContent = (
    <HostWorkbox
      state={workboxState}
      view={workboxView}
      disclosure={workboxDisclosure}
      loading={workboxLoading}
      error={workboxError ? "작업함을 불러오지 못했습니다." : null}
      pendingKey={workboxPendingKey}
      rowError={workboxRowError}
      showPartialWarnings={false}
      footerNote={workboxFooterText
        ? { text: workboxFooterText, historyHref: headerLinks?.historyHref ?? paths.hostBasePath }
        : null}
      onStateChange={(nextState) => {
        setWorkboxState(nextState);
        setWorkboxCursors([null]);
        setWorkboxRowError(null);
      }}
      onRetry={retryWorkbox}
      onLoadMore={(cursor) => {
        setWorkboxCursors((current) => current.includes(cursor) ? current : [...current, cursor]);
        setWorkboxRowError(null);
      }}
      onShowAll={showAllWorkbox}
      onDefer={(key, option) => { void deferWorkItem(key, option); }}
      onUndoDeferral={(key) => { void undoWorkItemDeferral(key); }}
      LinkComponent={LinkComponent}
    />
  );

  return (
    <HostOperatingRoomPage
      view={view}
      badge={badge}
      headerLinks={headerLinks}
      phaseLinks={phaseLinks}
      phaseNormalizationReason={phaseReasonFromState(location.state)}
      optionalFailureMessages={optionalFailureMessages}
      optionalFailureActions={[
        ...workboxWarningActions,
        ...(notificationFailure && !notificationRecovered ? [{
          key: "notification-health",
          message: notificationFailure.message,
          label: notificationRetry?.failureKey === notificationFailureKey
            && notificationRetry.state === "retrying"
            ? "알림 상태 불러오는 중"
            : "알림 상태 다시 불러오기",
          busy: notificationRetry?.failureKey === notificationFailureKey
            && notificationRetry.state === "retrying",
          onRetry: () => {
            if (!notificationFailureKey) return;
            setNotificationRetry({ failureKey: notificationFailureKey, state: "retrying" });
            void queryClient.fetchQuery({
              ...hostNotificationHealthQuery(context),
              staleTime: 0,
            }).then(() => {
              setNotificationRetry({ failureKey: notificationFailureKey, state: "recovered" });
            }).catch(() => {
              setNotificationRetry(null);
            });
          },
        }] : []),
      ]}
      recovery={recovery}
      liveContent={liveContent}
      compactLiveContent={compactLiveContent}
      closingContent={closingContent}
      workboxContent={workboxContent}
      createMeetingHref={paths.newMeetingHref}
      onPhaseChange={(phase) => {
        void navigate(phaseHref(phase), { state: withoutPhaseReason(location.state) });
      }}
      onRetryPreparation={() => {
        void refreshExactDetail();
        revalidator.revalidate();
      }}
      onRetryOptional={() => revalidator.revalidate()}
      nextActionPending={view.nextAction.workItemKey !== null
        && workboxPendingKey === view.nextAction.workItemKey}
      onDeferNextAction={(workItemKey) => { void deferWorkItem(workItemKey, "TOMORROW"); }}
      nextActionSecondary={view.phase === "live" && liveAgendaHref
        ? { href: liveAgendaHref, label: "모임 진행 보기" }
        : undefined}
      LinkComponent={LinkComponent}
    />
  );
}

function authoritativeOperatingRoomItems(
  items: readonly HostWorkboxItem[] | undefined,
  sessionId: string | null,
): readonly HostAuthoritativeWorkItem[] {
  if (!sessionId) return [];
  return (items ?? []).flatMap((item): HostAuthoritativeWorkItem[] => {
    const expectedSuffix = item.type === "SCHEDULE_UNSEEN"
      ? "schedule-review"
      : item.type === "RECORD_CLOSING"
        ? "closing"
        : null;
    if (!expectedSuffix || !destinationTargetsSession(item.destinationHref, sessionId, expectedSuffix)) {
      return [];
    }
    return [{
      kind: item.type === "SCHEDULE_UNSEEN" ? "schedule-seen" : "closing",
      workItemKey: item.key,
      state: item.state === "DEFERRED" ? "deferred" : "actionable",
    }];
  });
}

function destinationTargetsSession(
  destinationHref: string,
  sessionId: string,
  suffix: "schedule-review" | "closing",
): boolean {
  const pathname = new URL(destinationHref, "https://readmates.local").pathname;
  return pathname.endsWith(`/sessions/${encodeURIComponent(sessionId)}/${suffix}`);
}

function closingSourceFromLoader(
  loaderData: HostDashboardRouteData,
): HostOperatingRoomSource<SessionClosingStatusInput> {
  if (loaderData.closingStatus.state === "ready") {
    return { state: "ready", data: loaderData.closingStatus.data };
  }
  if (loaderData.closingStatus.state === "failed") {
    return {
      state: "failed",
      failure: {
        source: "closing",
        message: loaderData.closingStatus.error.message,
        retryable: loaderData.closingStatus.error.retryable,
      },
    };
  }
  return { state: "absent" };
}

function uniqueFailureMessages(
  loaderData: HostDashboardRouteData,
  view: HostOperatingRoomView,
): readonly string[] {
  const messages = [...view.partialFailures.map(({ message }) => message)];
  for (const source of [
    loaderData.recordAttention,
    loaderData.clubOperations,
  ]) {
    if (source.state === "failed") messages.push(source.error.message);
  }
  return [...new Set(messages)];
}

function phaseNormalizationMessage(
  requestedPhase: string | null,
  view: HostOperatingRoomView,
): string {
  const requested = view.phases.find(({ id }) => id === requestedPhase);
  if (!requested) {
    return `요청한 운영 단계가 없어 ${phaseLabel(view.phase)}로 이동했습니다.`;
  }
  const reason = requested.blockedReason
    ?.replace(/사용할 수 있습니다\.$/, "사용할 수 있어")
    ?? "지금은 사용할 수 없어";
  return `${requested.label}은 ${reason} ${phaseLabel(view.phase)}로 이동했습니다.`;
}

function routeStateRecord(state: unknown): Record<string, unknown> {
  return state && typeof state === "object" ? { ...state } : {};
}

function withPhaseReason(state: unknown, reason: string): Record<string, unknown> {
  return { ...routeStateRecord(state), [PHASE_REASON_STATE_KEY]: reason };
}

function withoutPhaseReason(state: unknown): Record<string, unknown> {
  const next = routeStateRecord(state);
  delete next[PHASE_REASON_STATE_KEY];
  return next;
}

function phaseReasonFromState(state: unknown): string | null {
  const value = routeStateRecord(state)[PHASE_REASON_STATE_KEY];
  return typeof value === "string" && value.trim() ? value : null;
}

function phaseLabel(phase: HostMeetingPhase): string {
  if (phase === "live") return "현장";
  if (phase === "closing") return "마감실";
  return "준비실";
}

function hostRoutePaths(clubSlug: string): HostRoutePaths {
  const appBasePath = `/clubs/${encodeURIComponent(clubSlug)}/app`;
  const hostBasePath = `${appBasePath}/host`;
  return {
    appBasePath,
    hostBasePath,
    newMeetingHref: `${hostBasePath}/sessions/new`,
  };
}

function currentMeetingBadge(
  phase: HostMeetingPhase,
  meeting: { sessionNumber: number; date: string | null },
  compactViewport: boolean,
): CurrentMeetingBadge {
  if (phase === "live") {
    return compactViewport
      ? { kind: "live", label: "진행 중" }
      : { kind: "today", label: "오늘" };
  }

  const dday = formatSessionKicker(meeting.sessionNumber, meeting.date ?? "").split(" · ")[1] ?? null;
  return dday ? { kind: "dday", label: dday } : null;
}

function hostSessionHref(hostBasePath: string, sessionId: string, suffix = ""): string {
  return `${hostBasePath}/sessions/${encodeURIComponent(sessionId)}${suffix}`;
}

function todayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function deferredUntilForOption(
  option: HostWorkboxDeferralOption,
  now = new Date(),
): string {
  const days = option === "TOMORROW" ? 1 : option === "THREE_DAYS" ? 3 : 7;
  const result = new Date(now);
  result.setDate(result.getDate() + days);
  result.setHours(9, 0, 0, 0);
  if (result.getTime() <= now.getTime()) result.setDate(result.getDate() + 1);
  return result.toISOString();
}

function attendanceLabel(attendance: MeetingAttendance): string {
  if (attendance === "ATTENDED") return "출석";
  if (attendance === "ABSENT") return "불참";
  return "확인 전";
}

function attendanceAttemptCanonicalLabel(
  detail: HostSessionDetailResponse | null,
  membershipIds: readonly string[],
): string {
  if (!detail) return "최신 값을 불러오지 못함";
  const labels = membershipIds.map((membershipId) => {
    const attendee = detail.attendees.find((row) => row.membershipId === membershipId);
    return attendee ? attendanceLabel(attendee.attendanceStatus) : "참여자 없음";
  });
  return [...new Set(labels)].join(" · ");
}

function attendanceAttemptMatches(
  detail: HostSessionDetailResponse | null,
  attempt: AttendanceAttempt,
): boolean {
  return Boolean(detail) && attempt.membershipIds.every((membershipId) =>
    detail?.attendees.some((attendee) =>
      attendee.membershipId === membershipId
      && attendee.attendanceStatus === attempt.attendance,
    ),
  );
}
