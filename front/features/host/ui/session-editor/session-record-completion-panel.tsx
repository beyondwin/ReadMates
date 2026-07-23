import type { ChangeEvent, ComponentType, CSSProperties, ReactNode } from "react";
import { AiGenerateTab } from "@/features/host/aigen/ui/AiGenerateTab";
import type {
  SessionImportPreviewResponse,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import type { SessionImportCommitResult } from "@/features/host/model/session-import-model";
import type { AiCommitResponse } from "@/features/host/aigen/api/aigen-contracts";
import type { ReadmatesReturnState } from "@/shared/routing/readmates-route-state";
import { Panel } from "./session-editor-panel";
import { SessionImportPanelBody } from "./session-import-panel";
import type { MobileEditorSection } from "./mobile-editor-tabs";

type FeedbackDocumentStatus = {
  uploaded: boolean;
  fileName: string | null;
};

type FeedbackPreviewLinkProps = {
  to: string;
  state?: ReadmatesReturnState;
  className?: string;
  children: ReactNode;
};

export type SessionRecordCompletionMode = "aigen" | "json";

type SessionRecordCompletionPanelProps = {
  activeMobileSection: MobileEditorSection;
  sessionId: string | undefined;
  clubSlug: string | undefined;
  mode: SessionRecordCompletionMode;
  canUseAigen: boolean;
  feedbackDocument: FeedbackDocumentStatus;
  previewState?: ReadmatesReturnState;
  LinkComponent: ComponentType<FeedbackPreviewLinkProps>;
  recordVisibility: SessionRecordVisibility;
  preview: SessionImportPreviewResponse | null;
  commitResult: SessionImportCommitResult | null;
  status: "idle" | "previewing" | "ready" | "committing" | "error";
  error: string | null;
  expectedDraftRevision: number | null;
  onModeChange: (mode: SessionRecordCompletionMode) => void;
  onAigenCommitted: (result: AiCommitResponse | null) => void;
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onCommit: () => void;
};

export function SessionRecordCompletionPanel({
  activeMobileSection,
  sessionId,
  clubSlug,
  mode,
  canUseAigen,
  feedbackDocument,
  previewState,
  LinkComponent,
  recordVisibility,
  preview,
  commitResult,
  status,
  error,
  expectedDraftRevision,
  onModeChange,
  onAigenCommitted,
  onFileSelected,
  onCommit,
}: SessionRecordCompletionPanelProps) {
  const effectiveMode = canUseAigen ? mode : "json";

  return (
    <Panel
      eyebrow="세션 기록"
      title="세션 기록 완성"
      mobileSection="records"
      panelId="host-editor-panel-session-record-completion"
      activeMobileSection={activeMobileSection}
    >
      <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        <FeedbackDocumentStatusView
          sessionId={sessionId}
          feedbackDocument={feedbackDocument}
          previewState={previewState}
          LinkComponent={LinkComponent}
        />
        {canUseAigen ? (
          <ModeTabs mode={effectiveMode} onModeChange={onModeChange} />
        ) : (
          <p className="small" style={{ color: "var(--text-2)" }}>
            AI 생성은 세션 저장 후 사용할 수 있습니다. 외부 JSON 가져오기는 계속 사용할 수 있습니다.
          </p>
        )}
        {effectiveMode === "aigen" && sessionId && clubSlug ? (
          <AiGenerateTab
            sessionId={sessionId}
            clubSlug={clubSlug}
            expectedDraftRevision={expectedDraftRevision}
            onCommitted={onAigenCommitted}
          />
        ) : (
          <SessionImportPanelBody
            sessionId={sessionId}
            recordVisibility={recordVisibility}
            preview={preview}
            commitResult={commitResult}
            status={status}
            error={error}
            onFileSelected={onFileSelected}
            onCommit={onCommit}
          />
        )}
      </div>
    </Panel>
  );
}

function FeedbackDocumentStatusView({
  sessionId,
  feedbackDocument,
  previewState,
  LinkComponent,
}: {
  sessionId: string | undefined;
  feedbackDocument: FeedbackDocumentStatus;
  previewState?: ReadmatesReturnState;
  LinkComponent: ComponentType<FeedbackPreviewLinkProps>;
}) {
  if (!sessionId) return null;
  return (
    <div className="surface-quiet" style={{ padding: 14 }}>
      <div className="row-between" style={{ gap: 12 }}>
        <div>
          <span className={feedbackDocument.uploaded ? "badge badge-ok badge-dot" : "badge"}>
            {feedbackDocument.uploaded ? "업로드 완료" : "미등록"}
          </span>
          <p className="small" style={{ margin: "8px 0 0", overflowWrap: "anywhere" }}>
            {feedbackDocument.fileName ?? "저장된 피드백 문서 없음"}
          </p>
        </div>
        {feedbackDocument.uploaded ? (
          <LinkComponent
            className="btn btn-quiet btn-sm"
            to={`/app/feedback/${encodeURIComponent(sessionId)}`}
            state={previewState}
          >
            미리보기
          </LinkComponent>
        ) : null}
      </div>
    </div>
  );
}

function ModeTabs({
  mode,
  onModeChange,
}: {
  mode: SessionRecordCompletionMode;
  onModeChange: (mode: SessionRecordCompletionMode) => void;
}) {
  return (
    <div className="row" role="tablist" aria-label="세션 기록 완성 방식" style={{ gap: 8, flexWrap: "wrap" }}>
      {[
        { mode: "aigen" as const, label: "AI로 생성" },
        { mode: "json" as const, label: "외부 JSON 가져오기" },
      ].map((option) => (
        <button
          key={option.mode}
          type="button"
          role="tab"
          aria-selected={mode === option.mode}
          className={`btn btn-sm${mode === option.mode ? " btn-primary" : " btn-quiet"}`}
          onClick={() => onModeChange(option.mode)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
