import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import {
  buildHostOperatingRoomView,
  type HostMeetingPhase,
  type HostOperatingRoomSource,
  type HostOperatingRoomView,
} from "@/features/host/model/host-operating-room-model";
import type { SessionClosingStatusInput } from "@/features/host/model/session-closing-model";
import {
  hostSessionChangeUndoDescription,
  hostSessionRestoreBlockedExplanation,
} from "@/features/host/model/host-session-editor-view-model";
import {
  HostMutationPendingError,
  hostSessionDetailQuery,
  useUpdateHostSessionAttendanceMutation,
} from "@/features/host/queries/host-session-queries";
import {
  hostSessionRestorePreviewQuery,
  useRestoreHostSessionChangeMutation,
} from "@/features/host/queries/host-session-recovery-queries";
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
import { SessionClosingBoard } from "@/features/host/ui/session-closing-board";
import type { WorkspacePendingUndo } from "@/features/host/ui/session-workspace/workspace-undo-bar";
import { formatSessionKicker } from "@/shared/ui/readmates-display";
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

  const detailQuery = useQuery({
    ...hostSessionDetailQuery(sessionId ?? "", context),
    enabled: Boolean(sessionId),
    initialData: loaderData.currentMeeting ?? undefined,
    retry: false,
  });
  const attendanceMutation = useUpdateHostSessionAttendanceMutation(context);
  const restoreMutation = useRestoreHostSessionChangeMutation(context);
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

  const requestedPhase = useMemo(
    () => new URLSearchParams(location.search).get("phase"),
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
    authoritativeWorkItems: [],
  }), [closingSource, paths.hostBasePath, requestedPhase, selectedDetail]);

  const view = useMemo<HostOperatingRoomView>(() => {
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

  const phaseHref = useCallback((phase: HostMeetingPhase) => {
    const search = new URLSearchParams(location.search);
    search.set("phase", phase);
    return `${location.pathname}?${search.toString()}${location.hash}`;
  }, [location.hash, location.pathname, location.search]);

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
    try {
      const result = await attendanceMutation.mutateAsync({
        sessionId: expectedSessionId,
        attendance: membershipIds.map((membershipId) => ({
          membershipId,
          attendanceStatus: attendance,
        })),
      });
      if (currentSessionIdRef.current !== expectedSessionId) return;
      setAttendanceWriteState(expectedSessionId, membershipIds, null);
      const receipt = result.changeReceipt ?? null;
      setPendingAttendanceUndo(receipt?.undoAvailable ? {
        sessionId: expectedSessionId,
        receipt,
        description: hostSessionChangeUndoDescription("ATTENDANCE"),
        error: null,
      } : null);
    } catch (error) {
      if (currentSessionIdRef.current !== expectedSessionId) return;
      if (error instanceof HostMutationPendingError) {
        setAttendanceUnknown({ ...attempt, canonicalLabel: null });
        return;
      }
      const writeState = meetingDayAttendanceWriteStateFromError(error);
      setAttendanceWriteState(expectedSessionId, membershipIds, writeState);
      if (writeState === "conflict") {
        const refreshed = await refreshExactDetail(expectedSessionId);
        if (currentSessionIdRef.current !== expectedSessionId) return;
        setAttendanceConflict({
          ...attempt,
          canonicalLabel: attendanceAttemptCanonicalLabel(refreshed, membershipIds),
        });
      }
    }
  }, [attendanceMutation, refreshExactDetail, sessionId, setAttendanceWriteState]);

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

  const pendingUndo: WorkspacePendingUndo | null = pendingAttendanceUndo && sessionId
    && pendingAttendanceUndo.sessionId === sessionId
    ? {
      description: pendingAttendanceUndo.description,
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
            await restoreMutation.mutateAsync({
              sessionId: current.sessionId,
              changeId: preview.changeId,
              request: { expectedCurrentHash: preview.expectedCurrentHash },
            });
            if (currentSessionIdRef.current !== current.sessionId) return;
            setPendingAttendanceUndo(null);
          } catch {
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

  const liveContent = selectedDetail ? (
    <MeetingResponseLedger
      presentation="meetingDay"
      rows={meetingResponseLedgerRowsFromAttendees(selectedDetail.attendees, activeAttendanceWriteStates)}
      onAttendanceChange={(membershipId, attendance) => {
        void commitAttendance([membershipId], attendance);
      }}
      onBulkAttendanceChange={(membershipIds, attendance) => {
        void commitAttendance(membershipIds, attendance);
      }}
      pendingUndo={pendingUndo}
    />
  ) : null;

  const closingContent = view.closing ? (
    <SessionClosingBoard view={view.closing} LinkComponent={LinkComponent} embedded />
  ) : (
    <p className="rm-host-operating-room__phase-state" role="alert">
      마감 상태를 불러오지 못했습니다. 준비된 다른 운영 정보는 그대로 유지됩니다.
    </p>
  );

  const optionalFailureMessages = uniqueFailureMessages(loaderData, view);
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
    memberViewHref: `${paths.appBasePath}/sessions/${encodeURIComponent(view.meeting.sessionId)}`,
  } : null;
  const phaseLinks = view.phases.map((phase) => ({ ...phase, href: phaseHref(phase.id) }));
  const dDayLabel = view.meeting
    ? formatSessionKicker(view.meeting.sessionNumber, view.meeting.date).split(" · ")[1] ?? null
    : null;

  return (
    <HostOperatingRoomPage
      view={view}
      dDayLabel={dDayLabel}
      headerLinks={headerLinks}
      phaseLinks={phaseLinks}
      phaseNormalizationReason={phaseReasonFromState(location.state)}
      optionalFailureMessages={optionalFailureMessages}
      recovery={recovery}
      liveContent={liveContent}
      closingContent={closingContent}
      createMeetingHref={paths.newMeetingHref}
      onPhaseChange={(phase) => {
        void navigate(phaseHref(phase), { state: withoutPhaseReason(location.state) });
      }}
      onRetryPreparation={() => {
        void refreshExactDetail();
        revalidator.revalidate();
      }}
      onRetryOptional={() => revalidator.revalidate()}
      LinkComponent={LinkComponent}
    />
  );
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
    loaderData.notificationHealth,
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

function hostSessionHref(hostBasePath: string, sessionId: string, suffix = ""): string {
  return `${hostBasePath}/sessions/${encodeURIComponent(sessionId)}${suffix}`;
}

function todayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
