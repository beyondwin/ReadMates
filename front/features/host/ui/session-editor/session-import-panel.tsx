import type { ChangeEvent, CSSProperties } from "react";
import type {
  SessionImportPreviewResponse,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import { sessionImportCanCommit, sessionImportReplacementWarning } from "@/features/host/model/session-import-model";
import { Panel } from "./session-editor-panel";
import type { MobileEditorSection } from "./mobile-editor-tabs";

type SessionImportPanelBodyProps = {
  sessionId: string | undefined;
  recordVisibility: SessionRecordVisibility;
  preview: SessionImportPreviewResponse | null;
  status: "idle" | "previewing" | "ready" | "committing" | "error";
  error: string | null;
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onCommit: () => void;
};

export function SessionImportPanelBody({
  sessionId,
  recordVisibility,
  preview,
  status,
  error,
  onFileSelected,
  onCommit,
}: SessionImportPanelBodyProps) {
  const canCommit = Boolean(sessionId) && status !== "committing" && sessionImportCanCommit(preview);

  return (
    <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
      <div className="small" style={{ color: "var(--text-2)" }}>
        {sessionId ? sessionImportReplacementWarning() : "세션을 만든 뒤 JSON 기록을 가져올 수 있습니다."}
      </div>
      <label className="field-label" htmlFor="session-import-json-file">
        AI 결과 JSON 가져오기
      </label>
      <input
        id="session-import-json-file"
        type="file"
        accept="application/json,.json"
        disabled={!sessionId || status === "previewing" || status === "committing"}
        onChange={onFileSelected}
      />
      {status === "previewing" ? (
        <div className="small" role="status">
          가져온 JSON을 확인하고 있습니다.
        </div>
      ) : null}
      {error ? (
        <div className="small" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}
      {preview ? (
        <div className="surface-quiet" style={{ padding: 16 }}>
          <div className="row-between" style={{ gap: 12, alignItems: "flex-start" }}>
            <div>
              <div className="eyebrow">미리보기</div>
              <div className="small" style={{ marginTop: 6 }}>
                {preview.session.sessionNumber ? `${preview.session.sessionNumber}회차 · ` : ""}
                {preview.session.bookTitle ?? "책 제목 확인 필요"}
              </div>
            </div>
            <span className={`rm-state ${preview.valid ? "rm-state--success" : "rm-state--danger"}`}>
              {preview.valid ? "저장 가능" : "확인 필요"}
            </span>
          </div>
          <p className="small" style={{ margin: "12px 0 0" }}>
            {preview.publication.summary}
          </p>
          <div className="tiny" style={{ marginTop: 10 }}>
            하이라이트 {preview.highlights.length}개 · 한줄평 {preview.oneLineReviews.length}개 · {preview.feedbackDocument.title ?? preview.feedbackDocument.fileName}
          </div>
          {preview.issues.length > 0 ? (
            <ul className="small" style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--danger)" }}>
              {preview.issues.map((issue) => (
                <li key={`${issue.code}:${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <button className="btn btn-primary" type="button" disabled={!canCommit} onClick={onCommit}>
        {status === "committing" ? "가져온 기록 저장 중" : "가져온 기록 저장"}
      </button>
      <div className="tiny">현재 선택한 공개 범위: {recordVisibility}</div>
    </div>
  );
}

export function SessionImportPanel({
  activeMobileSection,
  sessionId,
  recordVisibility,
  preview,
  status,
  error,
  onFileSelected,
  onCommit,
}: SessionImportPanelBodyProps & {
  activeMobileSection: MobileEditorSection;
}) {
  return (
    <Panel
      eyebrow="AI 결과 JSON"
      title="세션 기록 가져오기"
      mobileSection="report"
      panelId="host-editor-panel-session-import"
      activeMobileSection={activeMobileSection}
    >
      <SessionImportPanelBody
        sessionId={sessionId}
        recordVisibility={recordVisibility}
        preview={preview}
        status={status}
        error={error}
        onFileSelected={onFileSelected}
        onCommit={onCommit}
      />
    </Panel>
  );
}
