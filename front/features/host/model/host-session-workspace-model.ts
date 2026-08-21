export type HostSessionWorkspacePanel = "focus" | "basic" | "attendance" | "records" | "history";

export type HostSessionWorkspaceLocation = {
  panel: HostSessionWorkspacePanel;
  source: "manual" | "ai" | "json";
};

export type HostSessionWorkspaceInput = {
  state: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
  meetingDate: string;
  today: string;
  unknownAttendanceCount: number;
  hasRecordDraft: boolean;
  recordDraftStale: boolean;
  recordValidationIssueCount: number;
  hasAppliedRecord: boolean;
  publicationReady: boolean;
};

export type HostSessionWorkspaceView = {
  statusLabel: "모임 작성 중" | "멤버와 준비 중" | "기록 정리 중" | "공개 완료";
  primaryAction: { kind: string; label: string; panel: HostSessionWorkspacePanel };
  progress: ReadonlyArray<{ id: string; label: string; state: "done" | "current" | "next" }>;
};

type ProgressState = "done" | "current" | "next";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function buildHostSessionWorkspace(input: HostSessionWorkspaceInput): HostSessionWorkspaceView {
  const primaryAction = resolvePrimaryAction(input);
  return {
    statusLabel: statusLabelFor(input.state),
    primaryAction,
    progress: progressFor(input.state, primaryAction.kind),
  };
}

function statusLabelFor(
  state: HostSessionWorkspaceInput["state"],
): HostSessionWorkspaceView["statusLabel"] {
  switch (state) {
    case "DRAFT":
      return "모임 작성 중";
    case "OPEN":
      return "멤버와 준비 중";
    case "CLOSED":
      return "기록 정리 중";
    case "PUBLISHED":
      return "공개 완료";
  }
}

function resolvePrimaryAction(
  input: HostSessionWorkspaceInput,
): HostSessionWorkspaceView["primaryAction"] {
  switch (input.state) {
    case "DRAFT":
      return { kind: "OPEN_SESSION", label: "멤버와 준비 시작", panel: "focus" };
    case "OPEN":
      return resolveOpenAction(input);
    case "CLOSED":
      return resolveClosedAction(input);
    case "PUBLISHED":
      return { kind: "VIEW_PUBLIC_RECORD", label: "공개 기록 보기", panel: "focus" };
  }
}

function resolveOpenAction(
  input: HostSessionWorkspaceInput,
): HostSessionWorkspaceView["primaryAction"] {
  if (!isValidIsoDate(input.meetingDate) || !isValidIsoDate(input.today)) {
    return {
      kind: "REVIEW_MEMBER_INPUT",
      label: "멤버 응답 확인하기",
      panel: "focus",
    };
  }

  if (input.today < input.meetingDate) {
    return {
      kind: "REVIEW_MEMBER_INPUT",
      label: "멤버 응답 확인하기",
      panel: "focus",
    };
  }

  if (input.unknownAttendanceCount > 0) {
    return { kind: "CHECK_ATTENDANCE", label: "출석 확인하기", panel: "attendance" };
  }

  return { kind: "FINISH_SESSION", label: "모임 마치기", panel: "focus" };
}

function resolveClosedAction(
  input: HostSessionWorkspaceInput,
): HostSessionWorkspaceView["primaryAction"] {
  if (!input.hasRecordDraft) {
    return { kind: "UPLOAD_RECORD", label: "정리본 올리기", panel: "records" };
  }
  if (input.recordDraftStale || input.recordValidationIssueCount > 0) {
    return { kind: "FIX_RECORD", label: "반영 전 확인", panel: "records" };
  }
  if (!input.hasAppliedRecord) {
    return { kind: "REVIEW_RECORD", label: "기록에 반영", panel: "records" };
  }
  return { kind: "PUBLISH_RECORD", label: "기록 공개", panel: "records" };
}

function progressFor(
  state: HostSessionWorkspaceInput["state"],
  actionKind: string,
): HostSessionWorkspaceView["progress"] {
  const marker = progressMarker(state, actionKind);
  const items: Array<{ id: string; label: string }> = [
    { id: "basic", label: "기본 정보" },
    { id: "members", label: "멤버 준비" },
    { id: "attendance", label: "출석" },
    { id: "records", label: "기록" },
    { id: "publish", label: "공개" },
  ];

  return items.map((item, index) => ({
    ...item,
    state: progressStateAt(index, marker),
  }));
}

type ProgressMarker = { currentIndex: number } | { doneThrough: number };

function progressMarker(
  state: HostSessionWorkspaceInput["state"],
  actionKind: string,
): ProgressMarker {
  if (state === "DRAFT") return { currentIndex: 0 };
  if (state === "PUBLISHED") return { doneThrough: 4 };
  if (actionKind === "REVIEW_MEMBER_INPUT") return { currentIndex: 1 };
  if (actionKind === "CHECK_ATTENDANCE") return { currentIndex: 2 };
  if (actionKind === "FINISH_SESSION") return { doneThrough: 2 };
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

function progressStateAt(index: number, marker: ProgressMarker): ProgressState {
  if ("doneThrough" in marker) {
    return index <= marker.doneThrough ? "done" : "next";
  }
  if (index < marker.currentIndex) return "done";
  if (index === marker.currentIndex) return "current";
  return "next";
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
