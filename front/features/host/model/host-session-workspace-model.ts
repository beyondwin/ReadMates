import {
  formatMeetingLifecycle,
  formatPublicationAction,
  MEETING_APPLY_LABEL,
  MEETING_ATTENDANCE_LABEL,
} from "@/shared/model/meeting-language";
import { buildHostMeetingUrl } from "./host-session-workspace-navigation";

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

type HostMeetingLifecycle = "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";

type HostMeetingPrimaryAction = {
  kind: string;
  label: string;
  task: HostMeetingTask;
};

export type HostMeetingWorkspaceInput = {
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
  statusLabel: "모임 작성 중" | "멤버와 준비 중" | "기록 정리 중" | "게스트·멤버 노트 게시 완료";
  primaryAction: HostMeetingPrimaryAction;
  tasks: ReadonlyArray<HostMeetingTaskLink>;
  publicationReady: boolean;
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
  input: HostMeetingWorkspaceInput,
): HostMeetingWorkspaceView {
  return {
    lifecycle: input.state,
    statusLabel: statusLabelFor(input.state),
    primaryAction: resolvePrimaryAction(input),
    tasks: buildTaskLinks(input),
    publicationReady: input.publicationReady,
  };
}

function buildTaskLinks(input: HostMeetingWorkspaceInput): ReadonlyArray<HostMeetingTaskLink> {
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
    if (input.recordDraftStale || input.recordValidationIssueCount > 0) {
      return "확인 필요";
    }
    if (input.hasRecordDraft) {
      return "초안 있음";
    }
  }
  return undefined;
}

function statusLabelFor(
  state: HostMeetingLifecycle,
): HostMeetingWorkspaceView["statusLabel"] {
  return formatMeetingLifecycle(state, "host");
}

function resolvePrimaryAction(
  input: Omit<HostMeetingWorkspaceInput, "currentUrl" | "unansweredResponseCount">,
): HostMeetingPrimaryAction {
  switch (input.state) {
    case "DRAFT":
      return { kind: "OPEN_SESSION", label: "멤버와 준비 시작", task: "overview" };
    case "OPEN":
      return resolveOpenAction(input);
    case "CLOSED":
      return resolveClosedAction(input);
    case "PUBLISHED":
      return { kind: "VIEW_PUBLIC_RECORD", label: "공개 기록 보기", task: "overview" };
  }
}

function resolveOpenAction(
  input: Omit<HostMeetingWorkspaceInput, "currentUrl" | "unansweredResponseCount">,
): HostMeetingPrimaryAction {
  if (!isValidIsoDate(input.meetingDate) || !isValidIsoDate(input.today)) {
    return {
      kind: "REVIEW_MEMBER_INPUT",
      label: "멤버 응답 확인하기",
      task: "responses",
    };
  }

  if (input.today < input.meetingDate) {
    return {
      kind: "REVIEW_MEMBER_INPUT",
      label: "멤버 응답 확인하기",
      task: "responses",
    };
  }

  if (input.unknownAttendanceCount > 0) {
    return {
      kind: "CHECK_ATTENDANCE",
      label: `${MEETING_ATTENDANCE_LABEL} 확인`,
      task: "attendance",
    };
  }

  return { kind: "FINISH_SESSION", label: "모임 마치기", task: "overview" };
}

function resolveClosedAction(
  input: Omit<HostMeetingWorkspaceInput, "currentUrl" | "unansweredResponseCount">,
): HostMeetingPrimaryAction {
  if (
    input.hasAppliedRecord
    && !input.recordDraftStale
    && input.recordValidationIssueCount === 0
  ) {
    return {
      kind: "PUBLISH_RECORD",
      label: formatPublicationAction("publishMemberNotes"),
      task: "records",
    };
  }
  if (!input.hasRecordDraft) {
    return { kind: "UPLOAD_RECORD", label: "정리본 올리기", task: "records" };
  }
  if (input.recordDraftStale || input.recordValidationIssueCount > 0) {
    return { kind: "FIX_RECORD", label: "반영 전 확인", task: "records" };
  }
  return { kind: "REVIEW_RECORD", label: MEETING_APPLY_LABEL, task: "records" };
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
  HostMeetingWorkspaceInput,
  "currentUrl" | "unansweredResponseCount"
>;

/** @deprecated Internal Task 5→8 compatibility only. */
export type HostSessionWorkspaceView = {
  statusLabel: HostMeetingWorkspaceView["statusLabel"];
  primaryAction: { kind: string; label: string; panel: HostSessionWorkspacePanel };
  progress: ReadonlyArray<{ id: string; label: string; state: "done" | "current" | "next" }>;
  publicationReady: boolean;
};

/** @deprecated Internal Task 5→8 compatibility only. */
export function buildHostSessionWorkspace(
  input: HostSessionWorkspaceInput,
): HostSessionWorkspaceView {
  const primaryAction = resolvePrimaryAction(input);
  return {
    statusLabel: statusLabelFor(input.state),
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
