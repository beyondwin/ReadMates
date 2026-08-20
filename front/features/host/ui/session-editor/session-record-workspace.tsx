import {
  type ChangeEvent,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  useCallback,
  useState,
} from "react";
import type { SessionState } from "@/shared/model/readmates-types";
import {
  resolvedSessionExposure,
  sessionExposureCopy,
  type PublicSiteVisibility,
  type SessionAccessScope,
} from "@/features/host/model/session-exposure-model";
import type { HostSessionDraftSource } from "@/features/host/model/host-session-editor-navigation";
import type { HostSessionRecordDraft } from "@/features/host/model/host-session-editor-view-model";
import type { SessionImportPreviewResponse } from "@/features/host/model/host-view-types";
import type { SessionImportCommitResult } from "@/features/host/model/session-import-model";
import type { ReadmatesReturnState } from "@/shared/routing/readmates-route-state";
import { formatDateTimeLabel } from "@/shared/ui/readmates-display";
import type { HostSessionEditorLinkComponent } from "./session-editor-links";
import type { AiGenerateCommitResult } from "./session-record-completion-panel";
import { SessionRecordCompletionPanel } from "./session-record-completion-panel";
import type {
  DraftSaveState,
  SessionRecordDraftSnapshot,
} from "./session-record-draft-panel";
import {
  SessionRecordDraftPanelBody,
} from "./session-record-draft-panel";

export type SessionRecordWorkspaceProps = {
  state: SessionState;
  accessScope?: SessionAccessScope;
  siteVisibility?: PublicSiteVisibility;
  source: HostSessionDraftSource;
  onSourceChange: (source: HostSessionDraftSource) => void;
  liveRevision: number;
  liveSnapshot: SessionRecordDraftSnapshot;
  draft: {
    snapshot: SessionRecordDraftSnapshot;
    source: HostSessionRecordDraft["source"] | null;
    updatedAt: string | null;
    saveState: DraftSaveState;
    validationIssues: string[];
    liveBaseStale: boolean;
    rebasePending: boolean;
    rebaseError: string | null;
  };
  reviewPending: boolean;
  feedbackDocument: {
    uploaded: boolean;
    fileName: string | null;
    previewState?: ReadmatesReturnState;
    LinkComponent: HostSessionEditorLinkComponent;
  };
  creation: {
    sessionId?: string;
    clubSlug?: string;
    expectedDraftRevision: number | null;
    importPreview: SessionImportPreviewResponse | null;
    importCommitResult: SessionImportCommitResult | null;
    importStatus: "idle" | "previewing" | "ready" | "committing" | "error";
    importError: string | null;
  };
  actions: {
    onSnapshotChange: (snapshot: SessionRecordDraftSnapshot) => void;
    onReloadDraft: () => void | Promise<void>;
    onRebaseDraft: () => void | Promise<void>;
    onCopyInput: () => void | Promise<void>;
    onReviewDraft: () => void | Promise<void>;
    onAigenCommitted: (result: AiGenerateCommitResult) => void | Promise<void>;
    onImportFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
    onImportCommit: () => void;
  };
};

const recordSources = [
  { key: "manual", label: "직접 작성" },
  { key: "ai", label: "AI로 생성" },
  { key: "json", label: "정리본 올리기" },
] as const satisfies readonly { key: HostSessionDraftSource; label: string }[];

const draftSourceLabels: Record<HostSessionRecordDraft["source"], string> = {
  MANUAL: "직접 작성",
  AI_GENERATED: "AI로 생성",
  JSON_IMPORT: "정리본",
  RESTORED: "과거 버전에서 생성",
};

function sourceTabId(source: HostSessionDraftSource) {
  return `host-editor-record-source-tab-${source}`;
}

function sourcePanelId(source: HostSessionDraftSource) {
  return `host-editor-record-source-panel-${source}`;
}

function focusCommonEditor() {
  queueMicrotask(() => {
    document.getElementById("session-record-summary-input")?.focus();
  });
}

function draftStatusLabel(saveState: DraftSaveState) {
  return {
    idle: "초안 준비됨",
    dirty: "저장 대기 중",
    saving: "저장 중",
    saved: "저장됨",
    error: "저장 실패",
    stale: "최신 내용 확인 필요",
  }[saveState];
}

function firstValidationAnchor(issues: string[]) {
  const issue = issues[0]?.toUpperCase();
  if (!issue) return null;
  if (issue.includes("SUMMARY")) return "#session-record-summary";
  if (issue.includes("HIGHLIGHT")) return "#session-record-highlights";
  if (issue.includes("REVIEW")) return "#session-record-reviews";
  if (issue.includes("FEEDBACK")) return "#session-record-feedback";
  return null;
}

function nextActionPresentation(
  draft: SessionRecordWorkspaceProps["draft"],
  reviewPending: boolean,
) {
  if (!draft.source) {
    return { guidance: "초안을 먼저 만들어 주세요", reviewEnabled: false };
  }
  if (reviewPending) {
    return { guidance: "반영 전 확인 준비 중", reviewEnabled: false };
  }
  if (draft.saveState === "saving") {
    return { guidance: "저장 중", reviewEnabled: false };
  }
  if (draft.saveState === "error") {
    return { guidance: "저장 실패 후 다시 시도해 주세요", reviewEnabled: false };
  }
  if (draft.saveState === "stale" || draft.liveBaseStale) {
    return { guidance: "최신 적용본 확인", reviewEnabled: false };
  }
  if (draft.validationIssues.length > 0) {
    return { guidance: "확인이 필요한 항목을 수정해 주세요", reviewEnabled: false };
  }
  if (draft.saveState === "saved") {
    return { guidance: "저장된 초안을 반영 전에 검토해 주세요", reviewEnabled: true };
  }
  if (draft.saveState === "dirty") {
    return { guidance: "변경 내용 저장 대기 중", reviewEnabled: false };
  }
  return { guidance: "초안을 저장해 주세요", reviewEnabled: false };
}

function handleSourceKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  source: HostSessionDraftSource,
  canUseAi: boolean,
  onSourceChange: (nextSource: HostSessionDraftSource) => void,
) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  const availableSources = recordSources
    .map((item) => item.key)
    .filter((item) => item !== "ai" || canUseAi);
  const currentIndex = Math.max(availableSources.indexOf(source), 0);
  const lastIndex = availableSources.length - 1;
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? lastIndex
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + availableSources.length) % availableSources.length
        : (currentIndex + 1) % availableSources.length;
  const nextSource = availableSources[nextIndex];
  if (!nextSource) {
    return;
  }

  onSourceChange(nextSource);
  document.getElementById(sourceTabId(nextSource))?.focus();
}

export function SessionRecordWorkspace({
  state,
  accessScope,
  siteVisibility,
  source,
  onSourceChange,
  liveRevision,
  liveSnapshot,
  draft,
  reviewPending,
  feedbackDocument,
  creation,
  actions,
}: SessionRecordWorkspaceProps): JSX.Element {
  const canUseAi = Boolean(creation.sessionId) && Boolean(creation.clubSlug);
  const wrapUpFirstView = source === "json";
  const rovingSource = source === "ai" && !canUseAi ? "manual" : source;
  const [visitedSources, setVisitedSources] = useState<Set<HostSessionDraftSource>>(
    () => new Set([source]),
  );
  const nextAction = nextActionPresentation(draft, reviewPending);
  const exposure = resolvedSessionExposure({
    state,
    visibility: liveSnapshot.visibility,
    accessScope,
    siteVisibility,
  });
  const exposureCopy = sessionExposureCopy(exposure.accessScope, exposure.siteVisibility);
  const validationAnchor = firstValidationAnchor(draft.validationIssues);
  const FeedbackDocumentLink = feedbackDocument.LinkComponent;
  const feedbackPreviewHref = creation.sessionId
    ? `${creation.clubSlug ? `/clubs/${encodeURIComponent(creation.clubSlug)}` : ""}/app/host/sessions/${encodeURIComponent(creation.sessionId)}/feedback-document`
    : null;
  if (!visitedSources.has(source)) {
    setVisitedSources((current) => new Set(current).add(source));
  }

  const returnToCommonEditor = useCallback(() => {
    onSourceChange("manual");
    focusCommonEditor();
  }, [onSourceChange]);

  const handleAigenCommitted = useCallback(async (result: AiGenerateCommitResult) => {
    await actions.onAigenCommitted(result);
    returnToCommonEditor();
  }, [actions, returnToCommonEditor]);

  return (
    <div
      className="surface stack rm-session-record-workspace"
      style={{ "--stack": "20px", padding: 24, minWidth: 0 } as CSSProperties}
    >
      <header>
        <div className="eyebrow">모임 기록</div>
        <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>정리본</h2>
      </header>

      <div
        className="rm-session-record-workspace__context"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
          border: "1px solid var(--line-soft)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      >
        <section
          role="region"
          aria-labelledby="session-record-workspace-applied"
          style={{ padding: 16, minWidth: 0, overflowWrap: "anywhere" }}
        >
          <h3 id="session-record-workspace-applied" className="eyebrow" style={{ margin: 0 }}>
            멤버에게 보이는 기록
          </h3>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {liveRevision > 0 ? <span className="badge">버전 {liveRevision}</span> : null}
            <span className="badge">{exposureCopy.accessLabel}</span>
            <span className="badge">{exposureCopy.siteLabel}</span>
            <span className="badge">{feedbackDocument.uploaded ? "업로드 완료" : "미등록"}</span>
          </div>
          <p className="small" style={{ margin: "10px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {liveSnapshot.publicationSummary || "아직 적용된 기록이 없습니다."}
          </p>
          {feedbackDocument.uploaded
          && (feedbackDocument.fileName || liveSnapshot.feedbackDocument.fileName) ? (
            <p className="tiny" style={{ margin: "8px 0 0", overflowWrap: "anywhere" }}>
              {feedbackDocument.fileName || liveSnapshot.feedbackDocument.fileName}
            </p>
          ) : null}
          {feedbackDocument.uploaded && feedbackPreviewHref ? (
            <FeedbackDocumentLink
              className="btn btn-quiet btn-sm"
              to={feedbackPreviewHref}
              state={feedbackDocument.previewState}
              style={{ marginTop: 8 }}
            >
              피드백 문서 미리보기
            </FeedbackDocumentLink>
          ) : null}
        </section>

        <section
          role="region"
          aria-labelledby="session-record-workspace-draft"
          style={{
            padding: 16,
            minWidth: 0,
            overflowWrap: "anywhere",
            borderLeft: "1px solid var(--line-soft)",
          }}
        >
          <h3 id="session-record-workspace-draft" className="eyebrow" style={{ margin: 0 }}>
            작성 중
          </h3>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <span className="badge badge-dot">
              {draft.source ? draftStatusLabel(draft.saveState) : "준비된 초안 없음"}
            </span>
            <span className="badge">
              {draft.snapshot.feedbackDocument.fileName ? "초안 문서" : "초안 문서 없음"}
            </span>
          </div>
          <p className="small" style={{ margin: "10px 0 0" }}>
            {draft.source ? `작성 방식 · ${draftSourceLabels[draft.source]}` : "오른쪽 도구에서 초안을 시작할 수 있습니다."}
          </p>
          {draft.updatedAt ? (
            <p className="tiny mono" style={{ margin: "8px 0 0", overflowWrap: "anywhere" }}>
              최근 저장{" "}
              <time dateTime={draft.updatedAt}>{formatDateTimeLabel(draft.updatedAt)}</time>
            </p>
          ) : null}
          {draft.snapshot.feedbackDocument.fileName ? (
            <p className="tiny" style={{ margin: "8px 0 0", overflowWrap: "anywhere" }}>
              {draft.snapshot.feedbackDocument.fileName}
            </p>
          ) : null}
        </section>

        <section
          role="region"
          aria-labelledby="session-record-workspace-next"
          style={{
            padding: 16,
            minWidth: 0,
            borderLeft: "1px solid var(--line-soft)",
          }}
        >
          <h3 id="session-record-workspace-next" className="eyebrow" style={{ margin: 0 }}>
            다음 할 일
          </h3>
          <p className="small" style={{ margin: "10px 0" }}>{nextAction.guidance}</p>
          {validationAnchor ? (
            <a className="btn btn-quiet btn-sm" href={validationAnchor}>
              첫 오류 확인
            </a>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="session-record-creation-title" className="stack" style={{ "--stack": "12px" } as CSSProperties}>
        <div>
          <div className="eyebrow">작성 중</div>
          <h3 id="session-record-creation-title" className="h4 editorial" style={{ margin: "4px 0 0" }}>
            시작 방법을 선택하세요
          </h3>
        </div>
        <div
          className="row"
          role="tablist"
          aria-label="초안 만들기"
          onKeyDown={(event) => handleSourceKeyDown(event, source, canUseAi, onSourceChange)}
          style={{ gap: 8, flexWrap: "wrap" }}
        >
          {recordSources.map((item) => (
            <button
              key={item.key}
              id={sourceTabId(item.key)}
              type="button"
              role="tab"
              aria-selected={source === item.key}
              aria-controls={
                visitedSources.has(item.key) || source === item.key
                  ? sourcePanelId(item.key)
                  : undefined
              }
              tabIndex={rovingSource === item.key ? 0 : -1}
              className={`btn btn-sm${source === item.key ? " btn-primary" : " btn-quiet"}`}
              disabled={item.key === "ai" && !canUseAi}
              onClick={() => onSourceChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div
        className="rm-session-record-workspace__draft-layout"
        style={{ minWidth: 0 }}
      >
        <aside
          className="rm-session-record-workspace__creation-rail"
          style={{ minWidth: "min(100%, 280px)", maxWidth: "100%" }}
        >
          {visitedSources.has("manual") || source === "manual" ? (
            <div
              id={sourcePanelId("manual")}
              role="tabpanel"
              aria-labelledby={sourceTabId("manual")}
              hidden={source !== "manual"}
              className="surface-quiet small rm-session-record-workspace__creation-panel"
              style={{ padding: 16, overflowWrap: "anywhere" }}
            >
              공통 초안 편집기에서 직접 작성하세요. 입력은 같은 서버 초안에 자동으로 저장됩니다.
            </div>
          ) : null}

          {(["ai", "json"] as const).map((creationSource) =>
            visitedSources.has(creationSource) || source === creationSource ? (
              <div
                key={creationSource}
                id={sourcePanelId(creationSource)}
                role="tabpanel"
                aria-labelledby={sourceTabId(creationSource)}
                hidden={source !== creationSource}
                className="surface-quiet rm-session-record-workspace__creation-panel"
                style={{ padding: 16, minWidth: 0, overflowWrap: "anywhere" }}
              >
                <SessionRecordCompletionPanel
                  sessionId={creation.sessionId}
                  clubSlug={creation.clubSlug}
                  mode={creationSource}
                  canUseAigen={canUseAi}
                  recordVisibility={draft.snapshot.visibility}
                  preview={creation.importPreview}
                  status={creation.importStatus}
                  error={creation.importError}
                  expectedDraftRevision={creation.expectedDraftRevision}
                  onAigenCommitted={handleAigenCommitted}
                  onFileSelected={actions.onImportFileSelected}
                  onCommit={actions.onImportCommit}
                />
              </div>
            ) : null
          )}
        </aside>

        {wrapUpFirstView ? null : (
          <div className="rm-session-record-workspace__draft-editor" style={{ minWidth: 0 }}>
            <SessionRecordDraftPanelBody
              snapshot={draft.snapshot}
              state={state}
              saveState={draft.saveState}
              validationIssues={draft.validationIssues}
              draftLiveBaseStale={draft.liveBaseStale}
              onSnapshotChange={actions.onSnapshotChange}
              onReloadDraft={actions.onReloadDraft}
              onCopyInput={actions.onCopyInput}
              onRebaseDraft={actions.onRebaseDraft}
              rebasePending={draft.rebasePending}
              rebaseError={draft.rebaseError}
            />
          </div>
        )}
      </div>

      <section
        role="region"
        aria-label="반영 전 확인"
        className="rm-session-record-workspace__sticky-action surface"
        style={{
          position: "sticky",
          bottom: 8,
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 14px",
        }}
      >
        <span className="small">{nextAction.guidance}</span>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={!nextAction.reviewEnabled}
          onClick={() => void actions.onReviewDraft()}
        >
          반영 전 확인
        </button>
      </section>
    </div>
  );
}
