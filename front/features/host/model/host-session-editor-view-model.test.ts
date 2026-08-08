import { describe, expect, it } from "vitest";
import {
  buildHostSessionEditorOverview,
  buildHostSessionHistoryItemView,
  compactSessionLifecycleLabel,
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
      { section: "basic", source: "manual" },
      true,
    ],
    [
      "prioritizes an autosave error",
      { draft: { ...draft }, draftSaveState: "error" as const },
      "RESOLVE_DRAFT_SAVE",
      "초안 저장 문제를 해결하세요",
      { section: "records", source: "manual" },
      true,
    ],
    [
      "prioritizes a stale applied record base",
      { draft: { ...draft }, draftLiveBaseStale: true },
      "RESOLVE_STALE_BASE",
      "최신 적용본을 확인하세요",
      { section: "records", source: "manual" },
      true,
    ],
    [
      "prioritizes validation issues",
      { draft: { ...draft }, validationIssues: ["PUBLICATION_SUMMARY_REQUIRED"] },
      "FIX_VALIDATION",
      "확인이 필요한 항목을 수정하세요",
      { section: "records", source: "manual" },
      true,
    ],
    [
      "offers review for a saved valid draft",
      { draft: { ...draft }, draftSaveState: "saved" as const },
      "REVIEW_DRAFT",
      "초안 내용을 검토하세요",
      { section: "records", source: "manual" },
      true,
    ],
    [
      "offers a first draft when no applied record or draft exists",
      { liveRevision: 0, liveSnapshot: null },
      "CREATE_DRAFT",
      "기록 초안을 만들어 보세요",
      { section: "records", source: "manual" },
      true,
    ],
    [
      "reports an applied record with no further work as current",
      {},
      "UP_TO_DATE",
      "현재 기록이 최신입니다",
      { section: "overview", source: "manual" },
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
      versionLabel: null,
      visibilityLabel: "게스트 공개 · 공개 기록에 게시",
      appliedAt: null,
      summary: "요약이 아직 없습니다",
    });
    expect(buildHostSessionEditorOverview(overviewInput()).applied).toEqual({
      exists: true,
      versionLabel: "버전 3",
      visibilityLabel: "게스트 공개",
      appliedAt: "2026-07-27T09:00:00+09:00",
      summary: "함께 읽은 기록입니다.",
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
      canCreateDraft: true,
    });
  });

  it("allows creating a draft from a restored version with a persisted identifier", () => {
    expect(buildHostSessionHistoryItemView({
      type: "RECORD_REVISION_RESTORED",
      changedFields: [],
      revisionId: "revision-3",
      revisionVersion: 3,
      revisionSource: "RESTORED",
    }).canCreateDraft).toBe(true);
  });
});
