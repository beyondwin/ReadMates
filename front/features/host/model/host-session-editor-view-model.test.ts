import { describe, expect, it } from "vitest";
import {
  buildHostSessionEditorOverview,
  buildHostSessionHistoryItemView,
  buildHostSessionRestorePreviewItemView,
  compactSessionLifecycleLabel,
  hasAppliedSessionRecord,
  hostSessionChangeUndoDescription,
  hostSessionRestoreBlockedExplanation,
  hostSessionRestoreStaleExplanation,
} from "./host-session-editor-view-model";

const snapshot = {
  schema: "readmates-session-record:v1",
  visibility: "MEMBER",
  publicationSummary: "함께 읽은 기록입니다.",
  highlights: [],
  oneLineReviews: [],
  feedbackDocument: { fileName: "", title: "", markdown: "" },
} as const;

const draft = {
  sessionId: "session-1",
  baseLiveRevision: 3,
  draftRevision: 4,
  source: "MANUAL",
  restoredFromRevisionId: null,
  snapshot,
  updatedAt: "2026-07-27T10:00:00+09:00",
} as const;

function overviewInput() {
  return {
    isNewSession: false,
    liveRevision: 3,
    liveSnapshot: snapshot,
    lastAppliedAt: "2026-07-27T09:00:00+09:00",
    draft: null,
    draftSaveState: "idle" as const,
    draftLiveBaseStale: false,
    validationIssues: [],
  };
}

describe("host session editor view model", () => {
  it.each([
    [null, "새 예정 세션"],
    ["DRAFT", "예정"],
    ["OPEN", "준비 중"],
    ["CLOSED", "마감"],
    ["PUBLISHED", "공개"],
  ] as const)("maps %s to compact mobile lifecycle copy", (state, expected) => {
    expect(compactSessionLifecycleLabel(state)).toBe(expected);
  });

  it.each([
    [
      "requires basic information before a new session is saved",
      { isNewSession: true },
      "SAVE_BASIC",
      "기본 정보를 먼저 저장하세요",
      { panel: "basic", source: "manual" },
      true,
    ],
    [
      "prioritizes an autosave error",
      { draft: { ...draft }, draftSaveState: "error" as const },
      "RESOLVE_DRAFT_SAVE",
      "초안 저장 문제를 해결하세요",
      { panel: "records", source: "manual" },
      true,
    ],
    [
      "prioritizes a stale applied record base",
      { draft: { ...draft }, draftLiveBaseStale: true },
      "RESOLVE_STALE_BASE",
      "최신 적용본을 확인하세요",
      { panel: "records", source: "manual" },
      true,
    ],
    [
      "prioritizes validation issues",
      { draft: { ...draft }, validationIssues: ["PUBLICATION_SUMMARY_REQUIRED"] },
      "FIX_VALIDATION",
      "확인이 필요한 항목을 수정하세요",
      { panel: "records", source: "manual" },
      true,
    ],
    [
      "offers review for a saved valid draft",
      { draft: { ...draft }, draftSaveState: "saved" as const },
      "REVIEW_DRAFT",
      "초안 내용을 검토하세요",
      { panel: "records", source: "manual" },
      true,
    ],
    [
      "offers a first draft when no applied record or draft exists",
      { liveRevision: 0, liveSnapshot: null },
      "CREATE_DRAFT",
      "기록 초안을 만들어 보세요",
      { panel: "records", source: "manual" },
      true,
    ],
    [
      "reports an applied record with no further work as current",
      {},
      "UP_TO_DATE",
      "현재 기록이 최신입니다",
      { panel: "focus", source: "manual" },
      false,
    ],
  ] as const)("%s", (_name, overrides, kind, label, target, enabled) => {
    const overview = buildHostSessionEditorOverview({ ...overviewInput(), ...overrides });

    expect(overview.nextAction).toEqual({ kind, label, target, enabled });
  });

  it.each([
    [
      "unsaved session before record recovery states",
      {
        isNewSession: true,
        draft: { ...draft },
        draftSaveState: "error" as const,
        draftLiveBaseStale: true,
        validationIssues: ["PUBLICATION_SUMMARY_REQUIRED"],
      },
      "SAVE_BASIC",
    ],
    [
      "save error before stale base and validation",
      {
        draft: { ...draft },
        draftSaveState: "error" as const,
        draftLiveBaseStale: true,
        validationIssues: ["PUBLICATION_SUMMARY_REQUIRED"],
      },
      "RESOLVE_DRAFT_SAVE",
    ],
    [
      "stale base before validation and saved-draft review",
      {
        draft: { ...draft },
        draftSaveState: "saved" as const,
        draftLiveBaseStale: true,
        validationIssues: ["PUBLICATION_SUMMARY_REQUIRED"],
      },
      "RESOLVE_STALE_BASE",
    ],
    [
      "validation before saved-draft review",
      {
        draft: { ...draft },
        draftSaveState: "saved" as const,
        validationIssues: ["PUBLICATION_SUMMARY_REQUIRED"],
      },
      "FIX_VALIDATION",
    ],
  ] as const)("prioritizes %s", (_name, overrides, expectedKind) => {
    expect(buildHostSessionEditorOverview({
      ...overviewInput(),
      ...overrides,
    }).nextAction.kind).toBe(expectedKind);
  });

  it("projects applied record labels without inventing an applied time", () => {
    expect(buildHostSessionEditorOverview({
      ...overviewInput(),
      liveRevision: 0,
      liveSnapshot: { ...snapshot, visibility: "PUBLIC", publicationSummary: "  " },
      lastAppliedAt: null,
    }).applied).toEqual({
      exists: false,
      source: null,
      versionLabel: null,
      visibilityLabel: "게스트 공개 · 공개 기록에 게시",
      appliedAt: null,
      summary: "요약이 아직 없습니다",
      publicationSummary: "",
    });
    expect(buildHostSessionEditorOverview(overviewInput()).applied).toEqual({
      exists: true,
      source: "REVISION",
      versionLabel: "버전 3",
      visibilityLabel: "게스트 공개",
      appliedAt: "2026-07-27T09:00:00+09:00",
      summary: "함께 읽은 기록입니다.",
      publicationSummary: "함께 읽은 기록입니다.",
    });
  });

  it("treats a meaningful revision-zero live snapshot as an applied legacy baseline", () => {
    const legacySnapshot = {
      ...snapshot,
      publicationSummary: "레거시 공개 요약입니다.",
    };
    const legacyInput = {
      ...overviewInput(),
      liveRevision: 0,
      liveSnapshot: legacySnapshot,
      lastAppliedAt: null,
      draft: null,
    };

    expect(hasAppliedSessionRecord({ liveRevision: 0, liveSnapshot: legacySnapshot })).toBe(true);
    expect(hasAppliedSessionRecord({ liveRevision: 0, liveSnapshot: null })).toBe(false);
    expect(hasAppliedSessionRecord({
      liveRevision: 0,
      liveSnapshot: {
        ...snapshot,
        publicationSummary: "",
        highlights: [],
        oneLineReviews: [],
        feedbackDocument: { fileName: "feedback.md", title: "", markdown: "" },
      },
    })).toBe(false);
    expect(buildHostSessionEditorOverview(legacyInput).nextAction.kind).toBe("UP_TO_DATE");
    expect(buildHostSessionEditorOverview(legacyInput).applied).toEqual({
      exists: true,
      source: "LEGACY_SNAPSHOT",
      versionLabel: null,
      visibilityLabel: "게스트 공개",
      appliedAt: null,
      summary: "레거시 공개 요약입니다.",
      publicationSummary: "레거시 공개 요약입니다.",
    });
  });

  it.each([
    ["MANUAL", "직접 작성"],
    ["AI_GENERATED", "AI로 생성"],
    ["JSON_IMPORT", "외부 JSON"],
    ["RESTORED", "과거 버전에서 생성"],
  ] as const)("labels %s drafts for people", (source, sourceLabel) => {
    const overview = buildHostSessionEditorOverview({
      ...overviewInput(),
      draft: { ...draft, source },
      draftSaveState: "saved",
    });

    expect(overview.draft).toEqual({
      exists: true,
      statusLabel: "저장됨",
      sourceLabel,
      updatedAt: "2026-07-27T10:00:00+09:00",
      tone: "info",
    });
  });

  it.each([
    ["BASIC_INFO_UPDATED", "기본 정보 수정"],
    ["ATTENDANCE_UPDATED", "출석 수정"],
    ["RECORD_REVISION_APPLIED", "새 버전 반영"],
    ["RECORD_REVISION_RESTORED", "과거 버전으로 초안 생성"],
    ["NOTIFICATION_SENT", "알림 발송"],
    ["NOTIFICATION_SKIPPED", "알림 보내지 않음"],
  ] as const)("labels %s history without internal identifiers", (type, title) => {
    const item = {
      id: "history-1",
      type,
      createdAt: "2026-07-27T10:00:00+09:00",
      actorMembershipId: "membership-host",
      changedFields: ["publicationSummary", "visibility", "highlights", "oneLineReviews", "feedbackDocument"],
      attendanceTransitions: [],
      revisionId: "revision-3",
      revisionVersion: 3,
      revisionSource: "AI_GENERATED",
      restoredFromRevisionId: "revision-2",
      notificationEventId: "notification-1",
    } as const;

    expect(buildHostSessionHistoryItemView(item)).toEqual({
      title,
      versionLabel: "버전 3",
      detailItems: ["공개 요약", "공개 범위", "하이라이트", "한줄평", "피드백 문서"],
      sourceLabel: "AI로 생성",
      canCreateDraft: false,
      reasonNote: null,
      recovery: {
        action: null,
        available: false,
        buttonLabel: null,
        explanation: null,
      },
    });
  });

  it("allows creating a draft only from server recovery metadata", () => {
    expect(buildHostSessionHistoryItemView({
      type: "RECORD_REVISION_RESTORED",
      changedFields: [],
      revisionId: "revision-3",
      revisionVersion: 3,
      revisionSource: "RESTORED",
      recovery: { action: "RESTORE_RECORD_DRAFT", availability: "AVAILABLE" },
    }).canCreateDraft).toBe(true);
    expect(buildHostSessionHistoryItemView({
      type: "RECORD_REVISION_APPLIED",
      changedFields: [],
      revisionId: "revision-3",
      revisionVersion: 3,
      revisionSource: "MANUAL",
    }).canCreateDraft).toBe(false);
  });

  it("uses server recovery availability instead of history type", () => {
    expect(buildHostSessionHistoryItemView({
      type: "BASIC_INFO_UPDATED",
      changedFields: ["title"],
      revisionId: null,
      revisionVersion: null,
      revisionSource: null,
      recovery: {
        action: "RESTORE_CHANGE",
        availability: "UNAVAILABLE",
        blockedReason: "SNAPSHOT_UNAVAILABLE",
      },
    }).recovery).toEqual({
      action: "RESTORE_CHANGE",
      available: false,
      buttonLabel: null,
      explanation: "이 변경은 복원할 기록이 없어 바로 되돌릴 수 없습니다.",
    });
    expect(buildHostSessionHistoryItemView({
      type: "SESSION_OPENED",
      changedFields: [],
      revisionId: null,
      revisionVersion: null,
      revisionSource: null,
      recovery: { action: "REVERSE_LIFECYCLE", availability: "AVAILABLE" },
    }).recovery).toEqual({
      action: "REVERSE_LIFECYCLE",
      available: true,
      buttonLabel: "이 상태 되돌리기",
      explanation: null,
    });
  });

  it("describes undo receipts and redacted restore preview items", () => {
    expect(hostSessionChangeUndoDescription("BASIC_INFO")).toBe("모임 정보를 저장했습니다.");
    expect(hostSessionChangeUndoDescription("ATTENDANCE")).toBe("출석을 바꿨습니다.");
    expect(hostSessionRestoreStaleExplanation()).toBe("그 사이 다른 변경이 있습니다. 변경 내역에서 다시 확인하세요.");
    expect(hostSessionRestoreBlockedExplanation("SNAPSHOT_UNAVAILABLE"))
      .toBe("이 변경은 복원할 기록이 없어 바로 되돌릴 수 없습니다.");
    expect(buildHostSessionRestorePreviewItemView({
      field: "meetingUrl",
      currentValue: null,
      targetValue: null,
      sensitive: true,
    })).toEqual({
      key: "meetingUrl",
      label: "미팅 URL",
      currentValue: null,
      targetValue: null,
      sensitive: true,
    });
    expect(buildHostSessionRestorePreviewItemView({
      field: "attendanceStatus",
      subjectId: "membership-1",
      currentValue: "ATTENDED",
      targetValue: "UNKNOWN",
      sensitive: false,
    }, { memberLabel: "멤버1" })).toEqual({
      key: "attendanceStatus:membership-1",
      label: "출석 · 멤버1",
      currentValue: "참석",
      targetValue: "미확인",
      sensitive: false,
    });
    expect(buildHostSessionRestorePreviewItemView({
      field: "attendanceStatus",
      subjectId: "membership-2",
      currentValue: "ABSENT",
      targetValue: "UNKNOWN",
      sensitive: false,
    }).key).toBe("attendanceStatus:membership-2");
    expect(buildHostSessionRestorePreviewItemView({
      field: "attendanceStatus",
      subjectId: "membership-2",
      currentValue: "ABSENT",
      targetValue: "UNKNOWN",
      sensitive: false,
    }).label).toBe("출석 · membership-2");
  });
});
