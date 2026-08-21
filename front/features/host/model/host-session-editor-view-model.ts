import type {
  HostSessionChangeKind,
  HostSessionHistoryRecovery,
  HostSessionRestoreItem,
} from "@/features/host/api/host-session-recovery-contracts";
import { lifecycleReasonLabel } from "./host-session-lifecycle-model";
import {
  recordVisibilityLabel,
  type HostSessionState,
  type SessionRecordVisibility,
} from "./host-session-editor-model";
import type { HostSessionWorkspaceLocation } from "./host-session-workspace-navigation";
import type { DraftSaveState } from "./host-session-record-editor-model";

export type AppliedSessionRecordSource = "REVISION" | "LEGACY_SNAPSHOT";

export type SessionRecordSnapshot = {
  visibility: SessionRecordVisibility;
  publicationSummary: string;
  highlights: readonly unknown[];
  oneLineReviews: readonly unknown[];
  feedbackDocument: {
    fileName: string;
    title: string;
    markdown: string;
  };
};

export type HostSessionRecordDraft = {
  source: "MANUAL" | "AI_GENERATED" | "JSON_IMPORT" | "RESTORED";
  updatedAt: string;
};

export type HostSessionHistoryItem = {
  type:
    | "BASIC_INFO_UPDATED"
    | "ATTENDANCE_UPDATED"
    | "RECORD_REVISION_APPLIED"
    | "RECORD_REVISION_RESTORED"
    | "NOTIFICATION_SENT"
    | "NOTIFICATION_SKIPPED"
    | "SESSION_OPENED"
    | "SESSION_CLOSED"
    | "SESSION_PUBLISHED"
    | "SESSION_REOPENED"
    | "SESSION_UNPUBLISHED"
    | "SESSION_RETURNED_TO_DRAFT"
    | "SESSION_DELETED"
    | "SESSION_RESTORED";
  changedFields: readonly string[];
  revisionId: string | null;
  revisionVersion: number | null;
  revisionSource: "BASELINE" | "MANUAL" | "JSON_IMPORT" | "AI_GENERATED" | "RESTORED" | null;
  fromState?: string | null;
  toState?: string | null;
  reasonCode?: string | null;
  reasonNote?: string | null;
  recovery?: HostSessionHistoryRecovery | null;
};

export type HostSessionEditorNextActionKind =
  | "SAVE_BASIC"
  | "RESOLVE_DRAFT_SAVE"
  | "RESOLVE_STALE_BASE"
  | "FIX_VALIDATION"
  | "REVIEW_DRAFT"
  | "CREATE_DRAFT"
  | "UP_TO_DATE";

export type HostSessionEditorOverview = {
  applied: {
    exists: boolean;
    source: AppliedSessionRecordSource | null;
    versionLabel: string | null;
    visibilityLabel: string;
    appliedAt: string | null;
    summary: string;
    publicationSummary: string;
  };
  draft: {
    exists: boolean;
    statusLabel: string;
    sourceLabel: string | null;
    updatedAt: string | null;
    tone: "neutral" | "info" | "warning" | "danger";
  };
  nextAction: {
    kind: HostSessionEditorNextActionKind;
    label: string;
    target: HostSessionWorkspaceLocation;
    enabled: boolean;
  };
};

export type HostSessionEditorOverviewInput = {
  isNewSession: boolean;
  liveRevision: number;
  liveSnapshot: SessionRecordSnapshot | null;
  lastAppliedAt: string | null;
  draft: HostSessionRecordDraft | null;
  draftSaveState: DraftSaveState;
  draftLiveBaseStale: boolean;
  validationIssues: readonly string[];
};

export function hasAppliedSessionRecord({
  liveRevision,
  liveSnapshot,
}: Pick<HostSessionEditorOverviewInput, "liveRevision" | "liveSnapshot">): boolean {
  if (liveRevision > 0) return true;
  if (!liveSnapshot) return false;
  return Boolean(
    liveSnapshot.publicationSummary.trim()
      || liveSnapshot.highlights.length
      || liveSnapshot.oneLineReviews.length
      || liveSnapshot.feedbackDocument.title.trim()
      || liveSnapshot.feedbackDocument.markdown.trim()
  );
}

const recordTarget: HostSessionWorkspaceLocation = { panel: "records", source: "manual" };
const overviewTarget: HostSessionWorkspaceLocation = { panel: "focus", source: "manual" };
const basicTarget: HostSessionWorkspaceLocation = { panel: "basic", source: "manual" };

const draftSourceLabels: Record<HostSessionRecordDraft["source"], string> = {
  MANUAL: "직접 작성",
  AI_GENERATED: "AI로 생성",
  JSON_IMPORT: "외부 JSON",
  RESTORED: "과거 버전에서 생성",
};

const historyTypeLabels: Record<HostSessionHistoryItem["type"], string> = {
  BASIC_INFO_UPDATED: "기본 정보 수정",
  ATTENDANCE_UPDATED: "출석 수정",
  RECORD_REVISION_APPLIED: "새 버전 반영",
  RECORD_REVISION_RESTORED: "과거 버전으로 초안 생성",
  NOTIFICATION_SENT: "알림 발송",
  NOTIFICATION_SKIPPED: "알림 보내지 않음",
  SESSION_OPENED: "멤버에게 열기",
  SESSION_CLOSED: "모임 마치기",
  SESSION_PUBLISHED: "기록 공개",
  SESSION_REOPENED: "다시 진행 중으로",
  SESSION_UNPUBLISHED: "공개 취소",
  SESSION_RETURNED_TO_DRAFT: "모임 전으로 되돌리기",
  SESSION_DELETED: "휴지통으로 이동",
  SESSION_RESTORED: "모임 복원",
};

const changedFieldLabels: Record<string, string> = {
  publicationSummary: "공개 요약",
  visibility: "공개 범위",
  highlights: "하이라이트",
  oneLineReviews: "한줄평",
  feedbackDocument: "피드백 문서",
};

const compactSessionLifecycleLabels: Record<HostSessionState, string> = {
  DRAFT: "예정",
  OPEN: "준비 중",
  CLOSED: "마감",
  PUBLISHED: "공개",
};

const historySourceLabels: Record<NonNullable<HostSessionHistoryItem["revisionSource"]>, string> = {
  BASELINE: "기본 기록",
  ...draftSourceLabels,
};

export function buildHostSessionEditorOverview(input: HostSessionEditorOverviewInput): HostSessionEditorOverview {
  const exists = hasAppliedSessionRecord(input);
  const publicationSummary = input.liveSnapshot?.publicationSummary.trim() ?? "";
  return {
    applied: {
      exists,
      source: input.liveRevision > 0 ? "REVISION" : exists ? "LEGACY_SNAPSHOT" : null,
      versionLabel: input.liveRevision > 0 ? `버전 ${input.liveRevision}` : null,
      visibilityLabel: recordVisibilityLabel(input.liveSnapshot?.visibility ?? "HOST_ONLY"),
      appliedAt: input.lastAppliedAt,
      summary: publicationSummary || "요약이 아직 없습니다",
      publicationSummary,
    },
    draft: buildDraftOverview(input),
    nextAction: buildNextAction(input),
  };
}

export type HostSessionHistoryRecoveryView = {
  action: HostSessionHistoryRecovery["action"] | null;
  available: boolean;
  buttonLabel: string | null;
  explanation: string | null;
};

export type HostSessionHistoryItemView = {
  title: string;
  versionLabel: string | null;
  detailItems: string[];
  sourceLabel: string | null;
  canCreateDraft: boolean;
  reasonNote: string | null;
  recovery: HostSessionHistoryRecoveryView;
};

export type HostSessionRestorePreviewItemView = {
  key: string;
  label: string;
  currentValue: string | null;
  targetValue: string | null;
  sensitive: boolean;
};

const restoreFieldLabels: Record<string, string> = {
  title: "세션 제목",
  bookTitle: "책 제목",
  bookAuthor: "저자",
  bookLink: "책 링크",
  bookImageUrl: "책 이미지",
  date: "날짜",
  startTime: "시작 시간",
  endTime: "종료 시간",
  questionDeadlineAt: "질문 마감",
  locationLabel: "장소",
  meetingUrl: "미팅 URL",
  meetingPasscode: "Passcode",
  attendanceStatus: "출석",
};

const attendanceValueLabels: Record<string, string> = {
  UNKNOWN: "미확인",
  ATTENDED: "참석",
  ABSENT: "불참",
};

const undoDescriptions: Record<HostSessionChangeKind, string> = {
  BASIC_INFO: "모임 정보를 저장했습니다.",
  ATTENDANCE: "출석을 바꿨습니다.",
  LIFECYCLE: "모임 상태를 바꿨습니다.",
};

const restoreBlockedExplanations: Record<string, string> = {
  SNAPSHOT_UNAVAILABLE: "이 변경은 복원할 기록이 없어 바로 되돌릴 수 없습니다.",
  LIFECYCLE_INVERSE_NOT_VALID: "현재 상태에서는 바로 되돌릴 수 없습니다.",
  PARTICIPANT_NOT_ACTIVE: "참석자가 바뀌어 바로 되돌릴 수 없습니다.",
  ALREADY_RESTORED: "이미 되돌린 변경입니다.",
};

const recoveryButtonLabels: Record<HostSessionHistoryRecovery["action"], string | null> = {
  RESTORE_CHANGE: "이 변경 되돌리기",
  RESTORE_RECORD_DRAFT: "이 버전으로 초안 만들기",
  REVERSE_LIFECYCLE: "이 상태 되돌리기",
  NONE: null,
};

export function hostSessionChangeUndoDescription(kind: HostSessionChangeKind): string {
  return undoDescriptions[kind];
}

export function hostSessionRestoreBlockedExplanation(blockedReason: string | null | undefined): string {
  if (!blockedReason) {
    return "지금은 바로 되돌릴 수 없습니다.";
  }
  return restoreBlockedExplanations[blockedReason] ?? "지금은 바로 되돌릴 수 없습니다.";
}

export function hostSessionRestoreStaleExplanation(): string {
  return "그 사이 다른 변경이 있습니다. 변경 내역에서 다시 확인하세요.";
}

export function buildHostSessionRestorePreviewItemView(
  item: HostSessionRestoreItem,
  options?: { memberLabel?: string | null },
): HostSessionRestorePreviewItemView {
  return {
    key: restorePreviewItemKey(item),
    label: restorePreviewItemLabel(item, options?.memberLabel),
    currentValue: item.sensitive ? null : displayRestoreValue(item.field, item.currentValue),
    targetValue: item.sensitive ? null : displayRestoreValue(item.field, item.targetValue),
    sensitive: item.sensitive,
  };
}

function restorePreviewItemKey(item: HostSessionRestoreItem): string {
  return item.subjectId ? `${item.field}:${item.subjectId}` : item.field;
}

function restorePreviewItemLabel(item: HostSessionRestoreItem, memberLabel?: string | null): string {
  if (item.field === "attendanceStatus") {
    if (memberLabel) {
      return `출석 · ${memberLabel}`;
    }
    if (item.subjectId) {
      return `출석 · ${item.subjectId}`;
    }
    return "출석";
  }
  return restoreFieldLabels[item.field] ?? "변경 항목";
}

export function buildHostSessionHistoryRecoveryView(
  recovery: HostSessionHistoryRecovery | null | undefined,
): HostSessionHistoryRecoveryView {
  if (!recovery) {
    return {
      action: null,
      available: false,
      buttonLabel: null,
      explanation: null,
    };
  }
  const available = recovery.availability === "AVAILABLE";
  return {
    action: recovery.action,
    available,
    buttonLabel: available ? recoveryButtonLabels[recovery.action] : null,
    explanation: available ? null : hostSessionRestoreBlockedExplanation(recovery.blockedReason),
  };
}

export function buildHostSessionHistoryItemView(item: HostSessionHistoryItem): HostSessionHistoryItemView {
  const reasonLabel = lifecycleReasonLabel(item.reasonCode);
  const stateTransition = lifecycleStateTransitionLabel(item.fromState, item.toState);
  const recovery = buildHostSessionHistoryRecoveryView(item.recovery);
  return {
    title: historyTypeLabels[item.type],
    versionLabel: item.revisionVersion && item.revisionVersion > 0 ? `버전 ${item.revisionVersion}` : null,
    detailItems: [
      ...item.changedFields.flatMap((field) => changedFieldLabels[field] ? [changedFieldLabels[field]] : []),
      ...stateTransition ? [stateTransition] : [],
      ...reasonLabel ? [reasonLabel] : [],
    ],
    sourceLabel: item.revisionSource ? historySourceLabels[item.revisionSource] : null,
    canCreateDraft: recovery.action === "RESTORE_RECORD_DRAFT" && recovery.available,
    reasonNote: item.reasonNote ?? null,
    recovery,
  };
}

function displayRestoreValue(field: string, value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  if (field === "attendanceStatus") {
    return attendanceValueLabels[value] ?? value;
  }
  return value;
}

function lifecycleStateTransitionLabel(fromState: string | null | undefined, toState: string | null | undefined): string | null {
  if (!fromState && !toState) {
    return null;
  }
  return `${historyStateLabel(fromState)} → ${historyStateLabel(toState)}`;
}

function historyStateLabel(state: string | null | undefined): string {
  if (state === "DRAFT" || state === "OPEN" || state === "CLOSED" || state === "PUBLISHED") {
    return compactSessionLifecycleLabels[state];
  }
  return "삭제";
}

export function compactSessionLifecycleLabel(state: HostSessionState | null): string {
  return state === null ? "새 예정 세션" : compactSessionLifecycleLabels[state];
}

function buildDraftOverview(input: HostSessionEditorOverviewInput): HostSessionEditorOverview["draft"] {
  const state = draftStatePresentation(input.draftSaveState, input.draftLiveBaseStale);
  return {
    exists: input.draft !== null,
    statusLabel: state.statusLabel,
    sourceLabel: input.draft ? draftSourceLabels[input.draft.source] : null,
    updatedAt: input.draft?.updatedAt ?? null,
    tone: state.tone,
  };
}

function draftStatePresentation(
  saveState: DraftSaveState,
  staleBase: boolean,
): Pick<HostSessionEditorOverview["draft"], "statusLabel" | "tone"> {
  if (staleBase) {
    return { statusLabel: "최신 내용 확인 필요", tone: "warning" };
  }
  if (saveState === "error") {
    return { statusLabel: "저장 문제", tone: "danger" };
  }
  if (saveState === "stale") {
    return { statusLabel: "최신 내용 확인 필요", tone: "warning" };
  }
  if (saveState === "dirty") {
    return { statusLabel: "저장 대기 중", tone: "warning" };
  }
  if (saveState === "saving") {
    return { statusLabel: "저장 중", tone: "info" };
  }
  if (saveState === "saved") {
    return { statusLabel: "저장됨", tone: "info" };
  }
  return { statusLabel: "초안 준비됨", tone: "neutral" };
}

function buildNextAction(input: HostSessionEditorOverviewInput): HostSessionEditorOverview["nextAction"] {
  if (input.isNewSession) {
    return { kind: "SAVE_BASIC", label: "기본 정보를 먼저 저장하세요", target: basicTarget, enabled: true };
  }
  if (input.draftSaveState === "error") {
    return { kind: "RESOLVE_DRAFT_SAVE", label: "초안 저장 문제를 해결하세요", target: recordTarget, enabled: true };
  }
  if (input.draftLiveBaseStale || input.draftSaveState === "stale") {
    return { kind: "RESOLVE_STALE_BASE", label: "최신 적용본을 확인하세요", target: recordTarget, enabled: true };
  }
  if (input.validationIssues.length > 0) {
    return { kind: "FIX_VALIDATION", label: "확인이 필요한 항목을 수정하세요", target: recordTarget, enabled: true };
  }
  if (input.draft && input.draftSaveState === "saved") {
    return { kind: "REVIEW_DRAFT", label: "초안 내용을 검토하세요", target: recordTarget, enabled: true };
  }
  if (!hasAppliedSessionRecord(input) && !input.draft) {
    return { kind: "CREATE_DRAFT", label: "기록 초안을 만들어 보세요", target: recordTarget, enabled: true };
  }
  return { kind: "UP_TO_DATE", label: "현재 기록이 최신입니다", target: overviewTarget, enabled: false };
}
