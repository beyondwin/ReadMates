import {
  recordVisibilityLabel,
  type SessionRecordVisibility,
} from "./host-session-editor-model";
import type { HostSessionEditorLocation } from "./host-session-editor-navigation";
import type { DraftSaveState } from "./host-session-record-editor-model";

export type SessionRecordSnapshot = {
  visibility: SessionRecordVisibility;
  publicationSummary: string;
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
    | "NOTIFICATION_SKIPPED";
  changedFields: readonly string[];
  revisionId: string | null;
  revisionVersion: number | null;
  revisionSource: "BASELINE" | "MANUAL" | "JSON_IMPORT" | "AI_GENERATED" | "RESTORED" | null;
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
    versionLabel: string | null;
    visibilityLabel: string;
    appliedAt: string | null;
    summary: string;
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
    target: HostSessionEditorLocation;
    enabled: boolean;
  };
};

type HostSessionEditorOverviewInput = {
  isNewSession: boolean;
  liveRevision: number;
  liveSnapshot: SessionRecordSnapshot | null;
  lastAppliedAt: string | null;
  draft: HostSessionRecordDraft | null;
  draftSaveState: DraftSaveState;
  draftLiveBaseStale: boolean;
  validationIssues: readonly string[];
};

const recordTarget: HostSessionEditorLocation = { section: "records", source: "manual" };
const overviewTarget: HostSessionEditorLocation = { section: "overview", source: "manual" };
const basicTarget: HostSessionEditorLocation = { section: "basic", source: "manual" };

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
};

const changedFieldLabels: Record<string, string> = {
  publicationSummary: "공개 요약",
  visibility: "공개 범위",
  highlights: "하이라이트",
  oneLineReviews: "한줄평",
  feedbackDocument: "피드백 문서",
};

const historySourceLabels: Record<NonNullable<HostSessionHistoryItem["revisionSource"]>, string> = {
  BASELINE: "기본 기록",
  ...draftSourceLabels,
};

export function buildHostSessionEditorOverview(input: HostSessionEditorOverviewInput): HostSessionEditorOverview {
  return {
    applied: {
      exists: input.liveRevision > 0,
      versionLabel: input.liveRevision > 0 ? `버전 ${input.liveRevision}` : null,
      visibilityLabel: recordVisibilityLabel(input.liveSnapshot?.visibility ?? "HOST_ONLY"),
      appliedAt: input.lastAppliedAt,
      summary: input.liveSnapshot?.publicationSummary.trim() || "요약이 아직 없습니다",
    },
    draft: buildDraftOverview(input),
    nextAction: buildNextAction(input),
  };
}

export type HostSessionHistoryItemView = {
  title: string;
  versionLabel: string | null;
  detailItems: string[];
  sourceLabel: string | null;
  canCreateDraft: boolean;
};

export function buildHostSessionHistoryItemView(item: HostSessionHistoryItem): HostSessionHistoryItemView {
  return {
    title: historyTypeLabels[item.type],
    versionLabel: item.revisionVersion && item.revisionVersion > 0 ? `버전 ${item.revisionVersion}` : null,
    detailItems: item.changedFields.flatMap((field) => changedFieldLabels[field] ? [changedFieldLabels[field]] : []),
    sourceLabel: item.revisionSource ? historySourceLabels[item.revisionSource] : null,
    canCreateDraft: item.type === "RECORD_REVISION_APPLIED"
      && item.revisionId !== null
      && item.revisionVersion !== null
      && item.revisionVersion > 0,
  };
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
  if (input.liveRevision === 0 && !input.draft) {
    return { kind: "CREATE_DRAFT", label: "기록 초안을 만들어 보세요", target: recordTarget, enabled: true };
  }
  return { kind: "UP_TO_DATE", label: "현재 기록이 최신입니다", target: overviewTarget, enabled: false };
}
