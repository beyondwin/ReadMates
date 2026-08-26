import {
  formatMeetingLifecycle,
  formatPublicationAction,
  MEETING_APPLY_LABEL,
  MEETING_ATTENDANCE_LABEL,
} from "@/shared/model/meeting-language";
import {
  observedHostMeetingRecordFacts,
  type HostMeetingRecordFacts,
  type HostMeetingRecordReadiness,
} from "./host-meeting-record-readiness";
import { buildHostMeetingUrl } from "./host-session-workspace-navigation";

export type {
  HostMeetingRecordFacts,
  HostMeetingRecordReadiness,
} from "./host-meeting-record-readiness";

export type HostMeetingTask =
  | "overview"
  | "responses"
  | "attendance"
  | "records"
  | "notifications"
  | "history";

export type HostMeetingTaskLink = {
  task: HostMeetingTask;
  label: string;
  href: string;
  badge?: string;
};

export type HostMeetingLocation = {
  task: HostMeetingTask;
  overviewEditOpen: boolean;
  recordSource: "manual" | "ai" | "json";
};

export type HostFocusFact = {
  id: "identity" | "responses" | "attendance" | "record" | "publication";
  label: string;
  tone: "neutral" | "attention" | "ready" | "complete";
  relatedTask?: HostMeetingTask;
};

export type HostMeetingPrimaryAction = {
  kind: string;
  label: string;
  task: HostMeetingTask;
  disabled: boolean;
  reason?: string;
};

type HostMeetingLifecycle = "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";

export type HostMeetingWorkspaceInput = {
  currentUrl: string | URL;
  state: HostMeetingLifecycle;
  meetingDate: string;
  today: string;
  unansweredResponseCount: number;
  unknownAttendanceCount: number;
  recordReadiness: HostMeetingRecordReadiness;
};

/** @deprecated Compatibility until Task 4 route callers pass recordReadiness. */
export type HostMeetingWorkspaceLegacyInput = {
  currentUrl: string | URL;
  state: HostMeetingLifecycle;
  meetingDate: string;
  today: string;
  unansweredResponseCount: number;
  unknownAttendanceCount: number;
  hasRecordDraft: boolean;
  recordDraftStale: boolean;
  recordValidationIssueCount: number;
  hasAppliedRecord: boolean;
  publicationReady: boolean;
};

export type HostMeetingWorkspaceView = {
  lifecycle: HostMeetingLifecycle;
  statusLabel: "모임 작성 중" | "멤버와 준비 중" | "기록 정리 중" | "공개 완료";
  primaryAction: HostMeetingPrimaryAction;
  facts: readonly HostFocusFact[];
  relatedTasks: readonly HostMeetingTaskLink[];
  /** @deprecated Use relatedTasks. Kept until route consumers migrate. */
  tasks: readonly HostMeetingTaskLink[];
  publicationReady: boolean | null;
};

const HOST_MEETING_TASK_LABELS: ReadonlyArray<readonly [HostMeetingTask, string]> = [
  ["overview", "개요"],
  ["responses", "참석 응답"],
  ["attendance", "실제 출석"],
  ["records", "모임 기록"],
  ["notifications", "알림"],
  ["history", "변경 내역"],
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function buildHostMeetingWorkspace(
  input: HostMeetingWorkspaceInput | HostMeetingWorkspaceLegacyInput,
): HostMeetingWorkspaceView {
  const canonical = canonicalizeWorkspaceInput(input);
  const relatedTasks = buildTaskLinks(canonical);
  return {
    lifecycle: canonical.state,
    statusLabel: focusDeckStatusLabel(canonical.state),
    primaryAction: resolvePrimaryAction(canonical),
    facts: buildFocusFacts(canonical),
    relatedTasks,
    tasks: relatedTasks,
    publicationReady: publicationReadyFrom(canonical.recordReadiness),
  };
}

function canonicalizeWorkspaceInput(
  input: HostMeetingWorkspaceInput | HostMeetingWorkspaceLegacyInput,
): HostMeetingWorkspaceInput {
  if ("recordReadiness" in input) {
    return input;
  }
  return {
    currentUrl: input.currentUrl,
    state: input.state,
    meetingDate: input.meetingDate,
    today: input.today,
    unansweredResponseCount: input.unansweredResponseCount,
    unknownAttendanceCount: input.unknownAttendanceCount,
    recordReadiness: readyReadinessFromLegacy({
      hasRecordDraft: input.hasRecordDraft,
      recordDraftStale: input.recordDraftStale,
      recordValidationIssueCount: input.recordValidationIssueCount,
      hasAppliedRecord: input.hasAppliedRecord,
      publicationReady: input.publicationReady,
    }),
  };
}

function readyReadinessFromLegacy(input: {
  hasRecordDraft: boolean;
  recordDraftStale: boolean;
  recordValidationIssueCount: number;
  hasAppliedRecord: boolean;
  publicationReady: boolean;
}): HostMeetingRecordReadiness {
  return {
    status: "ready",
    observedAt: "legacy",
    facts: {
      hasDraft: input.hasRecordDraft,
      draftLiveBaseStale: input.recordDraftStale,
      validationIssueCount: input.recordValidationIssueCount,
      hasAppliedRecord: input.hasAppliedRecord,
      publicationReady: input.publicationReady,
    },
  };
}

function buildTaskLinks(input: HostMeetingWorkspaceInput): readonly HostMeetingTaskLink[] {
  return HOST_MEETING_TASK_LABELS.map(([task, label]) => {
    const badge = taskBadge(task, input);
    return {
      task,
      label,
      href: buildHostMeetingUrl(input.currentUrl, {
        task,
        overviewEditOpen: false,
        recordSource: "manual",
      }),
      ...(badge ? { badge } : {}),
    };
  });
}

function taskBadge(
  task: HostMeetingTask,
  input: HostMeetingWorkspaceInput,
): string | undefined {
  if (task === "responses" && input.unansweredResponseCount > 0) {
    return `미응답 ${input.unansweredResponseCount}`;
  }
  if (task === "attendance" && input.unknownAttendanceCount > 0) {
    return "확인 필요";
  }
  if (task === "records") {
    const facts = observedHostMeetingRecordFacts(input.recordReadiness);
    if (!facts) return undefined;
    if (facts.draftLiveBaseStale || facts.validationIssueCount > 0) {
      return "확인 필요";
    }
    if (facts.hasDraft) {
      return "초안 있음";
    }
  }
  return undefined;
}

function focusDeckStatusLabel(
  state: HostMeetingLifecycle,
): HostMeetingWorkspaceView["statusLabel"] {
  if (state === "DRAFT") return "모임 작성 중";
  if (state === "OPEN") return "멤버와 준비 중";
  if (state === "CLOSED") return "기록 정리 중";
  return "공개 완료";
}

function publicationReadyFrom(readiness: HostMeetingRecordReadiness): boolean | null {
  if (readiness.status === "ready") {
    return readiness.facts.publicationReady;
  }
  return null;
}

function resolvePrimaryAction(
  input: Omit<HostMeetingWorkspaceInput, "currentUrl">,
): HostMeetingPrimaryAction {
  switch (input.state) {
    case "DRAFT":
      return enabledAction("OPEN_SESSION", "멤버와 준비 시작", "overview");
    case "OPEN":
      return resolveOpenAction(input);
    case "CLOSED":
      return resolveClosedAction(input);
    case "PUBLISHED":
      return enabledAction("VIEW_PUBLIC_RECORD", "공개 기록 보기", "overview");
  }
}

function resolveOpenAction(
  input: Omit<HostMeetingWorkspaceInput, "currentUrl">,
): HostMeetingPrimaryAction {
  if (!isValidIsoDate(input.meetingDate) || !isValidIsoDate(input.today)) {
    return enabledAction("REVIEW_MEMBER_INPUT", "멤버 응답 확인하기", "responses");
  }

  if (input.today < input.meetingDate) {
    return enabledAction("REVIEW_MEMBER_INPUT", "멤버 응답 확인하기", "responses");
  }

  if (input.unknownAttendanceCount > 0) {
    return enabledAction("CHECK_ATTENDANCE", `${MEETING_ATTENDANCE_LABEL} 확인`, "attendance");
  }

  return enabledAction("FINISH_SESSION", "모임 마치기", "overview");
}

function resolveClosedAction(
  input: Omit<HostMeetingWorkspaceInput, "currentUrl">,
): HostMeetingPrimaryAction {
  const readiness = input.recordReadiness;
  if (readiness.status === "pending" || readiness.status === "not-required") {
    return confirmingRecordAction();
  }
  if (readiness.status === "stale") {
    return confirmingRecordAction("마지막 확인 시각이 오래되었습니다. 다시 시도하세요.");
  }
  if (readiness.status === "unavailable") {
    return confirmingRecordAction("모임 기록을 확인하지 못했습니다. 다시 시도하세요.");
  }

  const facts = readiness.facts;
  if (facts.hasAppliedRecord && !facts.draftLiveBaseStale && facts.validationIssueCount === 0) {
    return enabledAction("PUBLISH_RECORD", formatPublicationAction("publishMemberNotes"), "records");
  }
  if (!facts.hasDraft) {
    return enabledAction("UPLOAD_RECORD", "정리본 올리기", "records");
  }
  if (facts.draftLiveBaseStale || facts.validationIssueCount > 0) {
    return enabledAction("FIX_RECORD", "반영 전 확인", "records");
  }
  return enabledAction("REVIEW_RECORD", MEETING_APPLY_LABEL, "records");
}

function enabledAction(
  kind: string,
  label: string,
  task: HostMeetingTask,
): HostMeetingPrimaryAction {
  return { kind, label, task, disabled: false };
}

function confirmingRecordAction(reason?: string): HostMeetingPrimaryAction {
  return {
    kind: "CONFIRM_NEXT_ACTION",
    label: "다음 할 일 확인 중",
    task: "records",
    disabled: true,
    ...(reason ? { reason } : {}),
  };
}

function buildFocusFacts(input: HostMeetingWorkspaceInput): readonly HostFocusFact[] {
  const facts: HostFocusFact[] = [
    identityFact(input),
    responsesFact(input),
    attendanceFact(input),
  ];
  const record = recordFact(input);
  if (record) facts.push(record);
  const publication = publicationFact(input);
  if (publication) facts.push(publication);
  return facts;
}

function identityFact(input: HostMeetingWorkspaceInput): HostFocusFact {
  if (input.state === "DRAFT") {
    return { id: "identity", label: "모임 정보를 작성 중입니다.", tone: "neutral", relatedTask: "overview" };
  }
  if (input.state === "CLOSED") {
    return meetingDateIdentity(input, "모임을 마쳤습니다.", "neutral");
  }
  if (input.state === "PUBLISHED") {
    return meetingDateIdentity(input, "이 모임은 게시된 상태입니다.", "complete");
  }
  if (!isValidIsoDate(input.meetingDate) || !isValidIsoDate(input.today)) {
    return { id: "identity", label: "모임일을 확인하지 못했습니다.", tone: "attention", relatedTask: "overview" };
  }
  if (input.today < input.meetingDate) {
    return { id: "identity", label: `모임일은 ${input.meetingDate}입니다.`, tone: "neutral", relatedTask: "overview" };
  }
  if (input.today === input.meetingDate) {
    return { id: "identity", label: "오늘이 모임일입니다.", tone: "ready", relatedTask: "overview" };
  }
  return { id: "identity", label: "모임일이 지났습니다.", tone: "attention", relatedTask: "overview" };
}

function meetingDateIdentity(
  input: HostMeetingWorkspaceInput,
  fallback: string,
  tone: HostFocusFact["tone"],
): HostFocusFact {
  if (isValidIsoDate(input.meetingDate)) {
    return {
      id: "identity",
      label: `${input.meetingDate} ${fallback}`,
      tone,
      relatedTask: "overview",
    };
  }
  return { id: "identity", label: fallback, tone, relatedTask: "overview" };
}

function responsesFact(input: HostMeetingWorkspaceInput): HostFocusFact {
  if (input.state === "DRAFT") {
    return { id: "responses", label: "참석 응답은 아직 받지 않습니다.", tone: "neutral", relatedTask: "responses" };
  }
  if (input.unansweredResponseCount > 0) {
    return {
      id: "responses",
      label: `참석 응답이 없는 멤버가 ${input.unansweredResponseCount}명입니다.`,
      tone: "attention",
      relatedTask: "responses",
    };
  }
  return { id: "responses", label: "참석 응답 미응답이 없습니다.", tone: "ready", relatedTask: "responses" };
}

function attendanceFact(input: HostMeetingWorkspaceInput): HostFocusFact {
  if (input.state === "DRAFT") {
    return { id: "attendance", label: "실제 출석은 아직 확인하지 않습니다.", tone: "neutral", relatedTask: "attendance" };
  }
  if (input.unknownAttendanceCount > 0) {
    return {
      id: "attendance",
      label: `실제 출석이 확인되지 않은 멤버가 ${input.unknownAttendanceCount}명입니다.`,
      tone: "attention",
      relatedTask: "attendance",
    };
  }
  return { id: "attendance", label: "실제 출석 미확인이 없습니다.", tone: "ready", relatedTask: "attendance" };
}

function recordFact(input: HostMeetingWorkspaceInput): HostFocusFact | null {
  const readiness = input.recordReadiness;
  if (readiness.status === "not-required") return null;
  if (readiness.status === "pending") {
    return { id: "record", label: "모임 기록을 확인하는 중입니다.", tone: "attention", relatedTask: "records" };
  }
  if (readiness.status === "unavailable") {
    return { id: "record", label: "모임 기록을 확인하지 못했습니다.", tone: "attention", relatedTask: "records" };
  }
  if (readiness.status === "stale") {
    return { id: "record", label: "모임 기록이 최신이 아닙니다.", tone: "attention", relatedTask: "records" };
  }
  return recordFactFromFacts(readiness.facts);
}

function recordFactFromFacts(facts: HostMeetingRecordFacts): HostFocusFact {
  if (facts.draftLiveBaseStale || facts.validationIssueCount > 0) {
    return { id: "record", label: "모임 기록을 반영하기 전에 확인이 필요합니다.", tone: "attention", relatedTask: "records" };
  }
  if (facts.hasDraft && !facts.hasAppliedRecord) {
    return { id: "record", label: "모임 기록 초안이 있습니다.", tone: "ready", relatedTask: "records" };
  }
  if (facts.hasAppliedRecord) {
    return { id: "record", label: "모임 기록이 반영되어 있습니다.", tone: "complete", relatedTask: "records" };
  }
  return { id: "record", label: "모임 기록이 아직 없습니다.", tone: "attention", relatedTask: "records" };
}

function publicationFact(input: HostMeetingWorkspaceInput): HostFocusFact | null {
  const facts = observedHostMeetingRecordFacts(input.recordReadiness);
  if (!facts) return null;
  if (input.state === "PUBLISHED") {
    return {
      id: "publication",
      label: "게스트·멤버 노트에 게시되어 있습니다.",
      tone: "complete",
      relatedTask: "records",
    };
  }
  if (facts.publicationReady) {
    return {
      id: "publication",
      label: "게스트·멤버 노트에 게시할 수 있습니다.",
      tone: "ready",
      relatedTask: "records",
    };
  }
  return {
    id: "publication",
    label: "게스트·멤버 노트에는 아직 게시되지 않았습니다.",
    tone: "attention",
    relatedTask: "records",
  };
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year
    && utc.getUTCMonth() === month - 1
    && utc.getUTCDate() === day
  );
}

/**
 * @deprecated Internal Task 5→8 compatibility only. New code uses
 * HostMeetingLocation and HostMeetingTask.
 */
export type HostSessionWorkspacePanel = "focus" | "basic" | "attendance" | "records" | "history";

/** @deprecated Internal Task 5→8 compatibility only. */
export type HostSessionWorkspaceLocation = {
  panel: HostSessionWorkspacePanel;
  source: HostMeetingLocation["recordSource"];
};

/** @deprecated Internal Task 5→8 compatibility only. */
export type HostSessionWorkspaceInput = Omit<
  HostMeetingWorkspaceLegacyInput,
  "currentUrl" | "unansweredResponseCount"
>;

/** @deprecated Internal Task 5→8 compatibility only. */
export type HostSessionWorkspaceView = {
  statusLabel: "모임 작성 중" | "멤버와 준비 중" | "기록 정리 중" | "게스트·멤버 노트 게시 완료";
  primaryAction: { kind: string; label: string; panel: HostSessionWorkspacePanel };
  progress: ReadonlyArray<{ id: string; label: string; state: "done" | "current" | "next" }>;
  publicationReady: boolean;
};

/** @deprecated Internal Task 5→8 compatibility only. */
export function buildHostSessionWorkspace(
  input: HostSessionWorkspaceInput,
): HostSessionWorkspaceView {
  const primaryAction = resolvePrimaryAction({
    state: input.state,
    meetingDate: input.meetingDate,
    today: input.today,
    unansweredResponseCount: 0,
    unknownAttendanceCount: input.unknownAttendanceCount,
    recordReadiness: readyReadinessFromLegacy(input),
  });
  return {
    statusLabel: formatMeetingLifecycle(input.state, "host") as HostSessionWorkspaceView["statusLabel"],
    primaryAction: {
      kind: primaryAction.kind,
      label: primaryAction.label,
      panel: compatibilityPanelFor(primaryAction),
    },
    progress: compatibilityProgressFor(input.state, primaryAction.kind),
    publicationReady: input.publicationReady,
  };
}

function compatibilityPanelFor(action: HostMeetingPrimaryAction): HostSessionWorkspacePanel {
  if (action.task === "attendance") return "attendance";
  if (action.task === "records") return "records";
  return "focus";
}

function compatibilityProgressFor(
  state: HostMeetingLifecycle,
  actionKind: string,
): HostSessionWorkspaceView["progress"] {
  const marker = compatibilityProgressMarker(state, actionKind);
  const items: Array<{ id: string; label: string }> = [
    { id: "basic", label: "기본 정보" },
    { id: "members", label: "멤버 준비" },
    { id: "attendance", label: "출석" },
    { id: "records", label: "기록" },
    { id: "publish", label: "공개" },
  ];

  return items.map((item, index) => ({
    ...item,
    state: compatibilityProgressStateAt(index, marker),
  }));
}

type CompatibilityProgressMarker = { currentIndex: number } | { doneThrough: number };

function compatibilityProgressMarker(
  state: HostMeetingLifecycle,
  actionKind: string,
): CompatibilityProgressMarker {
  if (state === "DRAFT") return { currentIndex: 0 };
  if (state === "PUBLISHED") return { doneThrough: 4 };
  if (actionKind === "REVIEW_MEMBER_INPUT") return { currentIndex: 1 };
  if (actionKind === "CHECK_ATTENDANCE" || actionKind === "FINISH_SESSION") {
    return { currentIndex: 2 };
  }
  if (
    actionKind === "UPLOAD_RECORD"
    || actionKind === "FIX_RECORD"
    || actionKind === "REVIEW_RECORD"
  ) {
    return { currentIndex: 3 };
  }
  if (actionKind === "PUBLISH_RECORD") return { currentIndex: 4 };
  return { currentIndex: 0 };
}

function compatibilityProgressStateAt(
  index: number,
  marker: CompatibilityProgressMarker,
): "done" | "current" | "next" {
  if ("doneThrough" in marker) {
    return index <= marker.doneThrough ? "done" : "next";
  }
  if (index < marker.currentIndex) return "done";
  if (index === marker.currentIndex) return "current";
  return "next";
}
