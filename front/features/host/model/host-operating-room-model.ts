import type { HostSessionDetailResponse } from "../api/host-contracts";
import { hostMeetingLifecycleLabel } from "@/shared/model/meeting-language";
import {
  hostScheduleSeenSummary,
  type HostScheduleSeenSummary,
} from "./host-schedule-seen-model";
import { reverseLifecycleAction } from "./host-session-lifecycle-model";
import {
  getSessionClosingBoardView,
  type SessionClosingBoardView,
  type SessionClosingStatusInput,
} from "./session-closing-model";

export type HostMeetingPhase = "prep" | "live" | "closing";
export type HostNextActionState = "actionable" | "deferred" | "conflict" | "unknown" | "none";
export type PreparationRowId = "schedule-seen" | "rsvp" | "questions" | "place";

export type OperatingRoomFailureSource = "schedule-seen" | "questions" | "closing";

export type OperatingRoomFailure = {
  source: OperatingRoomFailureSource;
  message: string;
  retryable: boolean;
};

export type HostOperatingRoomSource<T> =
  | { state: "ready"; data: T }
  | { state: "absent" }
  | { state: "failed"; failure: OperatingRoomFailure };

export type CurrentMeetingHeaderView = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string;
  lifecycle: HostSessionDetailResponse["state"];
  lifecycleLabel: string;
  reverseLifecycleAction: ReturnType<typeof reverseLifecycleAction>;
};

export type MeetingPhaseTabView = {
  id: HostMeetingPhase;
  label: string;
  availability: "available" | "blocked" | "complete";
  blockedReason: string | null;
};

export type HostNextActionKind =
  | "create-meeting"
  | "schedule-notification"
  | "attendance"
  | "schedule-seen"
  | "rsvp"
  | "questions"
  | "place"
  | "closing"
  | "none";

export type HostNextActionView = {
  kind: HostNextActionKind;
  state: HostNextActionState;
  workItemKey: string | null;
  label: string;
  reason: string;
  href: string | null;
};

export type PreparationLedgerRowView = {
  id: PreparationRowId;
  label: string;
  state: "normal" | "warning" | "complete" | "unavailable";
  value: string;
  detail: string;
  numerator: number | null;
  denominator: number | null;
  href: string | null;
  workItemKey: string | null;
};

export type PhaseStatusLedgerRowView = {
  label: string;
  value: string;
  detail: string;
  href: string | null;
  action: string;
};

export type HostOperatingRoomView = {
  meeting: CurrentMeetingHeaderView | null;
  phases: readonly MeetingPhaseTabView[];
  phase: HostMeetingPhase;
  nextAction: HostNextActionView;
  preparation: readonly PreparationLedgerRowView[];
  partialFailures: readonly OperatingRoomFailure[];
  closing: SessionClosingBoardView | null;
};

export type HostQuestionPreparation = {
  respondingMemberCount: number;
  eligibleMemberCount: number;
  questionCount: number;
};

export type HostPendingOutcome = {
  kind: Extract<HostNextActionKind, "schedule-notification">;
  state: Extract<HostNextActionState, "conflict" | "unknown">;
  workItemKey: string;
  label: string;
  reason: string;
  href: string;
};

export type HostAuthoritativeWorkItem = {
  kind: Exclude<HostNextActionKind, "create-meeting" | "schedule-notification" | "none">;
  workItemKey: string;
  state: Extract<HostNextActionState, "actionable" | "deferred">;
};

export type HostOperatingRoomInput = {
  currentMeeting: HostSessionDetailResponse | null;
  requestedPhase: string | null;
  today: string;
  basePath: string;
  questions: HostOperatingRoomSource<HostQuestionPreparation>;
  closing: HostOperatingRoomSource<SessionClosingStatusInput>;
  pendingOutcome: HostPendingOutcome | null;
  /** @deprecated Local key guesses are deliberately ignored. */
  deferredWorkItemKeys?: readonly string[];
  authoritativeWorkItems: readonly HostAuthoritativeWorkItem[];
};

const PHASE_LABELS: Record<HostMeetingPhase, string> = {
  prep: "준비실",
  live: "현장",
  closing: "마감실",
};

export function buildHostOperatingRoomView(input: HostOperatingRoomInput): HostOperatingRoomView {
  if (!input.currentMeeting) {
    return emptyOperatingRoom(input.basePath);
  }

  const meeting = input.currentMeeting;
  const partialFailures: OperatingRoomFailure[] = [];
  const phases = buildPhases(meeting, input.today);
  const phase = normalizePhase(input.requestedPhase, phases, defaultPhase(meeting, input.today));
  const schedule = scheduleSeenRow(
    meeting,
    input.basePath,
    authoritativeKey(input, "schedule-seen"),
    partialFailures,
  );
  const rsvp = rsvpRow(meeting, input.basePath, authoritativeKey(input, "rsvp"));
  const questions = questionRow(
    meeting,
    input.questions,
    input.basePath,
    authoritativeKey(input, "questions"),
    partialFailures,
  );
  const place = placeRow(meeting, input.basePath, authoritativeKey(input, "place"));
  const preparation = [schedule, rsvp, questions, place] as const;
  const closing = closingView(meeting, input.closing, input.basePath, partialFailures);
  const nextAction = resolveNextAction({
    input,
    meeting,
    preparation,
    phases,
    closing,
  });

  return {
    meeting: {
      sessionId: meeting.sessionId,
      sessionNumber: meeting.sessionNumber,
      title: meeting.title,
      bookTitle: meeting.bookTitle,
      bookAuthor: meeting.bookAuthor,
      bookImageUrl: meeting.bookImageUrl,
      date: meeting.date,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      locationLabel: meeting.locationLabel,
      lifecycle: meeting.state,
      lifecycleLabel: hostMeetingLifecycleLabel(meeting.state),
      reverseLifecycleAction: reverseLifecycleAction(meeting.state),
    },
    phases,
    phase,
    nextAction,
    preparation,
    partialFailures,
    closing,
  };
}

function emptyOperatingRoom(basePath: string): HostOperatingRoomView {
  return {
    meeting: null,
    phases: phaseEntries(() => ({ availability: "blocked", blockedReason: "현재 모임이 없습니다." })),
    phase: "prep",
    nextAction: {
      kind: "create-meeting",
      state: "actionable",
      workItemKey: null,
      label: "첫 모임 만들기",
      reason: "운영실에서 준비할 첫 모임을 만드세요.",
      href: hostPath(basePath, "/sessions/new"),
    },
    preparation: [],
    partialFailures: [],
    closing: null,
  };
}

function buildPhases(
  meeting: HostSessionDetailResponse,
  today: string,
): readonly MeetingPhaseTabView[] {
  switch (meeting.state) {
    case "DRAFT":
      return phaseEntries((id) => id === "prep"
        ? { availability: "available", blockedReason: null }
        : { availability: "blocked", blockedReason: id === "live" ? "모임을 연 뒤 사용할 수 있습니다." : "모임을 마친 뒤 사용할 수 있습니다." });
    case "OPEN": {
      const liveAvailable = isOnOrAfter(meeting.date, today);
      return phaseEntries((id) => {
        if (id === "prep") return { availability: "available", blockedReason: null };
        if (id === "live") return liveAvailable
          ? { availability: "available", blockedReason: null }
          : { availability: "blocked", blockedReason: "모임 당일부터 사용할 수 있습니다." };
        return { availability: "blocked", blockedReason: "모임을 마친 뒤 사용할 수 있습니다." };
      });
    }
    case "CLOSED":
      return phaseEntries((id) => id === "closing"
        ? { availability: "available", blockedReason: null }
        : { availability: "complete", blockedReason: null });
    case "PUBLISHED":
      return phaseEntries(() => ({ availability: "complete", blockedReason: null }));
  }
}

function phaseEntries(
  resolve: (id: HostMeetingPhase) => Pick<MeetingPhaseTabView, "availability" | "blockedReason">,
): readonly MeetingPhaseTabView[] {
  return (["prep", "live", "closing"] as const).map((id) => ({ id, label: PHASE_LABELS[id], ...resolve(id) }));
}

function defaultPhase(meeting: HostSessionDetailResponse, today: string): HostMeetingPhase {
  if (meeting.state === "CLOSED" || meeting.state === "PUBLISHED") return "closing";
  if (meeting.state === "OPEN" && isOnOrAfter(meeting.date, today)) return "live";
  return "prep";
}

function normalizePhase(
  requested: string | null,
  phases: readonly MeetingPhaseTabView[],
  fallback: HostMeetingPhase,
): HostMeetingPhase {
  const phase = phases.find((candidate) => candidate.id === requested);
  return phase && phase.availability !== "blocked" ? phase.id : fallback;
}

function scheduleSeenRow(
  meeting: HostSessionDetailResponse,
  basePath: string,
  authoritativeWorkItemKey: string | null,
  failures: OperatingRoomFailure[],
): PreparationLedgerRowView {
  const summary = hostScheduleSeenSummary(meeting);
  const href = hostSessionPath(basePath, meeting.sessionId, "/schedule-review");
  if (summary.availability === "UNAVAILABLE") {
    if (meeting.state === "DRAFT") {
      return unavailableRow("schedule-seen", "일정 확인", "아직 멤버에게 공개되지 않음", "멤버 공개 뒤 집계가 시작됩니다.", null);
    }
    failures.push({ source: "schedule-seen", message: "일정 확인 집계를 불러오지 못했습니다.", retryable: true });
    return unavailableRow("schedule-seen", "일정 확인", "집계 준비 중", "최신 일정 확인 상태를 다시 불러오세요.", null);
  }
  if (!hasScheduleCounts(summary)) {
    failures.push({ source: "schedule-seen", message: "일정 확인 집계 계약이 완전하지 않습니다.", retryable: true });
    return unavailableRow("schedule-seen", "일정 확인", "집계 준비 중", "분모를 확인한 뒤 다시 표시합니다.", null);
  }

  const unseenCount = countFor(summary, "UNSEEN");
  const staleCount = countFor(summary, "STALE");
  const pendingCount = unseenCount + staleCount;
  return {
    id: "schedule-seen",
    label: "일정 확인",
    state: pendingCount > 0 ? "warning" : "complete",
    value: `현재 일정 확인 ${countFor(summary, "CURRENT")}/${summary.eligibleCount}`,
    detail: pendingCount > 0 ? `미열람 ${unseenCount} · 변경 전 확인 ${staleCount}` : "모두 최신 일정을 확인했습니다.",
    numerator: countFor(summary, "CURRENT"),
    denominator: summary.eligibleCount,
    href,
    workItemKey: pendingCount > 0 ? authoritativeWorkItemKey : null,
  };
}

function hasScheduleCounts(summary: HostScheduleSeenSummary): summary is HostScheduleSeenSummary & { eligibleCount: number } {
  return summary.eligibleCount !== null && summary.states.every(({ count }) => count !== null);
}

function countFor(summary: HostScheduleSeenSummary, state: "CURRENT" | "STALE" | "UNSEEN"): number {
  return summary.states.find((candidate) => candidate.state === state)?.count ?? 0;
}

function rsvpRow(
  meeting: HostSessionDetailResponse,
  basePath: string,
  authoritativeWorkItemKey: string | null,
): PreparationLedgerRowView {
  const participants = activeParticipants(meeting);
  const responded = participants.filter(({ rsvpStatus }) => rsvpStatus !== "NO_RESPONSE").length;
  const missing = participants.length - responded;
  return {
    id: "rsvp",
    label: "참석 응답",
    state: missing > 0 ? "warning" : "complete",
    value: `응답 ${responded}/${participants.length}`,
    detail: missing > 0 ? `미응답 ${missing}` : "모든 참여자가 응답했습니다.",
    numerator: responded,
    denominator: participants.length,
    href: hostSessionPath(basePath, meeting.sessionId, "?section=responses"),
    workItemKey: missing > 0 ? authoritativeWorkItemKey : null,
  };
}

function questionRow(
  meeting: HostSessionDetailResponse,
  source: HostOperatingRoomSource<HostQuestionPreparation>,
  basePath: string,
  authoritativeWorkItemKey: string | null,
  failures: OperatingRoomFailure[],
): PreparationLedgerRowView {
  const href = hostSessionPath(basePath, meeting.sessionId, "?section=responses&focus=questions");
  if (source.state !== "ready") {
    failures.push(source.state === "failed"
      ? source.failure
      : { source: "questions", message: "발제 질문 집계 계약이 없습니다.", retryable: true });
    return unavailableRow("questions", "발제 질문", "집계 준비 중", "질문 집계를 다시 불러오세요.", href);
  }
  const { respondingMemberCount, eligibleMemberCount, questionCount } = source.data;
  return {
    id: "questions",
    label: "발제 질문",
    state: questionCount > 0 ? "complete" : "warning",
    value: `질문 작성 ${respondingMemberCount}/${eligibleMemberCount} · ${questionCount}개`,
    detail: questionCount > 0 ? "발제 질문이 모였습니다." : "첫 발제 질문을 준비하세요.",
    numerator: respondingMemberCount,
    denominator: eligibleMemberCount,
    href,
    workItemKey: questionCount === 0 ? authoritativeWorkItemKey : null,
  };
}

function placeRow(
  meeting: HostSessionDetailResponse,
  basePath: string,
  authoritativeWorkItemKey: string | null,
): PreparationLedgerRowView {
  const location = meeting.locationLabel.trim();
  const prepared = location.length > 0 || Boolean(meeting.meetingUrl);
  return {
    id: "place",
    label: "장소 준비",
    state: prepared ? "complete" : "warning",
    value: location || (meeting.meetingUrl ? "온라인 모임" : "장소 미정"),
    detail: prepared ? "모임 장소가 준비되었습니다." : "멤버가 확인할 장소를 입력하세요.",
    numerator: null,
    denominator: null,
    href: hostSessionPath(basePath, meeting.sessionId, "?section=basic&edit=1"),
    workItemKey: prepared ? null : authoritativeWorkItemKey,
  };
}

function unavailableRow(
  id: PreparationRowId,
  label: string,
  value: string,
  detail: string,
  href: string | null,
): PreparationLedgerRowView {
  return { id, label, state: "unavailable", value, detail, numerator: null, denominator: null, href, workItemKey: null };
}

function closingView(
  meeting: HostSessionDetailResponse,
  source: HostOperatingRoomSource<SessionClosingStatusInput>,
  basePath: string,
  failures: OperatingRoomFailure[],
): SessionClosingBoardView | null {
  if (meeting.state !== "CLOSED" && meeting.state !== "PUBLISHED") return null;
  if (source.state === "ready") {
    const view = getSessionClosingBoardView(source.data);
    return {
      ...view,
      primaryAction: {
        ...view.primaryAction,
        href: normalizeLegacyHostHref(view.primaryAction.href, basePath),
      },
      checklist: view.checklist.map((item) => ({
        ...item,
        href: normalizeLegacyHostHref(item.href, basePath),
      })),
      surfaces: view.surfaces.map((surface) => ({
        ...surface,
        href: normalizeLegacyHostHref(surface.href, basePath),
      })),
    };
  }
  failures.push(source.state === "failed"
    ? source.failure
    : { source: "closing", message: "마감 상태 계약이 없습니다.", retryable: true });
  return null;
}

function resolveNextAction(context: {
  input: HostOperatingRoomInput;
  meeting: HostSessionDetailResponse;
  preparation: readonly PreparationLedgerRowView[];
  phases: readonly MeetingPhaseTabView[];
  closing: SessionClosingBoardView | null;
}): HostNextActionView {
  if (context.input.pendingOutcome) return context.input.pendingOutcome;

  const { meeting } = context;
  if (meeting.state === "PUBLISHED") return noNextAction();
  if (meeting.state === "CLOSED") {
    if (!context.closing) {
      return {
        kind: "closing",
        state: "unknown",
        workItemKey: null,
        label: "마감 상태 다시 확인",
        reason: "마감 상태를 확인할 수 없어 안전하게 다시 읽어야 합니다.",
        href: hostSessionPath(context.input.basePath, meeting.sessionId, "?section=records"),
      };
    }
    if (context.closing.primaryAction.label === "추가 조치 없음") return noNextAction();
    return actionState(context.input, {
      kind: "closing",
      label: context.closing.primaryAction.label,
      reason: context.closing.primaryAction.reason,
      href: context.closing.primaryAction.href,
    });
  }

  const liveAvailable = context.phases.some(({ id, availability }) => id === "live" && availability === "available");
  const unknownAttendanceCount = activeParticipants(meeting).filter(({ attendanceStatus }) => attendanceStatus === "UNKNOWN").length;
  if (liveAvailable && unknownAttendanceCount > 0) {
    return actionState(context.input, {
      kind: "attendance",
      label: "실제 출석 확인",
      reason: `출석이 확인되지 않은 멤버가 ${unknownAttendanceCount}명입니다.`,
      href: hostSessionPath(context.input.basePath, meeting.sessionId, "?section=attendance"),
    });
  }

  for (const kind of ["schedule-seen", "rsvp", "questions", "place"] as const) {
    const row = context.preparation.find(({ id }) => id === kind);
    if (row?.state === "warning") {
      return actionState(context.input, {
        kind,
        label: nextActionLabel(kind),
        reason: row.detail,
        href: row.href,
      });
    }
    if (kind === "questions" && row?.state === "unavailable") {
      return {
        kind: "questions",
        state: "unknown",
        workItemKey: null,
        label: "발제 질문 집계 다시 확인",
        reason: row.detail,
        href: row.href,
      };
    }
  }
  return noNextAction();
}

function actionState(
  input: HostOperatingRoomInput,
  action: Omit<HostNextActionView, "state" | "workItemKey">,
): HostNextActionView {
  const authority = authoritativeWorkItem(input, action.kind);
  return {
    ...action,
    state: authority?.state ?? "actionable",
    workItemKey: authority?.workItemKey ?? null,
  };
}

function authoritativeKey(
  input: HostOperatingRoomInput,
  kind: HostAuthoritativeWorkItem["kind"],
): string | null {
  return authoritativeWorkItem(input, kind)?.workItemKey ?? null;
}

function authoritativeWorkItem(
  input: HostOperatingRoomInput,
  kind: HostNextActionKind,
): HostAuthoritativeWorkItem | null {
  return input.authoritativeWorkItems.find((item) => item.kind === kind) ?? null;
}

function nextActionLabel(kind: Extract<PreparationRowId, "schedule-seen" | "rsvp" | "questions" | "place">): string {
  switch (kind) {
    case "schedule-seen": return "일정 미확인 멤버 검토";
    case "rsvp": return "참석 응답 확인";
    case "questions": return "발제 질문 준비";
    case "place": return "모임 장소 입력";
  }
}

function noNextAction(): HostNextActionView {
  return {
    kind: "none",
    state: "none",
    workItemKey: null,
    label: "지금 필요한 조치 없음",
    reason: "현재 모임의 필수 준비가 확인되었습니다.",
    href: null,
  };
}

export function buildLivePhaseStatusRows(
  meeting: HostSessionDetailResponse,
  basePath: string,
): PhaseStatusLedgerRowView[] {
  const participants = activeParticipants(meeting);
  const total = participants.length;
  const attended = participants.filter(({ attendanceStatus }) => attendanceStatus === "ATTENDED").length;
  const absent = participants.filter(({ attendanceStatus }) => attendanceStatus === "ABSENT").length;
  const unknown = participants.filter(({ attendanceStatus }) => attendanceStatus === "UNKNOWN").length;
  const going = participants.filter(({ rsvpStatus }) => rsvpStatus === "GOING").length;
  const declined = participants.filter(({ rsvpStatus }) => rsvpStatus === "DECLINED").length;
  const maybe = participants.filter(({ rsvpStatus }) => rsvpStatus === "MAYBE").length;
  const noResponse = participants.filter(({ rsvpStatus }) => rsvpStatus === "NO_RESPONSE").length;
  const responded = going + declined + maybe;
  const rsvpDetail = maybe > 0
    ? `참석 ${going} · 불참 ${declined} · 미정 ${maybe} · 미응답 ${noResponse}`
    : `참석 ${going} · 불참 ${declined} · 미응답 ${noResponse}`;

  return [
    {
      label: "실제 출석",
      value: `${attended} / ${total}`,
      detail: `참석 ${attended} · 알린 불참 ${absent} · 확인 필요 ${unknown}`,
      href: hostSessionPath(basePath, meeting.sessionId, "?section=attendance"),
      action: "출석 보기",
    },
    {
      label: "참석 응답",
      value: `${responded} / ${total}`,
      detail: rsvpDetail,
      href: hostSessionPath(basePath, meeting.sessionId, "?section=responses"),
      action: "응답 보기",
    },
    {
      label: "진행 순서",
      value: "확인 전",
      detail: "진행 순서는 모임 작업에서 확인할 수 있어요",
      href: hostSessionPath(basePath, meeting.sessionId, "?section=agenda"),
      action: "진행 보기",
    },
    {
      label: "현장 메모",
      value: "확인 전",
      detail: "호스트만 볼 수 있어요",
      href: hostSessionPath(basePath, meeting.sessionId, "?section=notes"),
      action: "메모 열기",
    },
  ];
}

export function buildClosingPhaseStatusRows(
  closing: SessionClosingBoardView,
): PhaseStatusLedgerRowView[] {
  return closing.checklist.map((item) => ({
    label: closingLedgerLabel(item.label),
    value: item.state === "DONE" ? "완료" : item.stateLabel,
    detail: item.completedStamp ?? item.detail,
    href: item.href,
    action: closingLedgerAction(item.label),
  }));
}

function closingLedgerLabel(label: string): string {
  return label === "피드백 문서 확인" ? "피드백 문서" : label;
}

function closingLedgerAction(label: string): string {
  if (label === "출석 확정") return "출석 보기";
  if (label === "소감 수집") return "대상 보기";
  if (label === "기록 초안") return "초안 열기";
  if (label === "피드백 문서 확인" || label === "피드백 문서") return "문서 확인";
  if (label === "멤버 게시") return "게시 조건";
  return "자세히 보기";
}

function activeParticipants(meeting: HostSessionDetailResponse) {
  return meeting.attendees.filter(({ participationStatus }) => participationStatus !== "REMOVED");
}

function isOnOrAfter(meetingDate: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(meetingDate)
    && /^\d{4}-\d{2}-\d{2}$/.test(today)
    && today >= meetingDate;
}

function hostSessionPath(basePath: string, sessionId: string, suffix: string): string {
  return hostPath(basePath, `/sessions/${encodeURIComponent(sessionId)}${suffix}`);
}

function hostPath(basePath: string, suffix: string): string {
  return `${basePath.replace(/\/+$/, "")}${suffix}`;
}

function normalizeLegacyHostHref(href: string | null, basePath: string): string | null {
  if (!href) return null;
  if (href === "/app/host") return hostPath(basePath, "/");
  if (href.startsWith("/app/host/") || href.startsWith("/app/host?")) {
    return hostPath(basePath, href.slice("/app/host".length));
  }
  return href;
}
