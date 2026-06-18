import type { ChangeEvent, CSSProperties } from "react";
import type {
  SessionImportPreviewResponse,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import {
  buildSessionImportReview,
  sessionImportReplacementWarning,
  type SessionImportReview,
} from "@/features/host/model/session-import-model";
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
  const review = preview ? buildSessionImportReview(preview, recordVisibility) : null;
  const canCommit = Boolean(sessionId) && status !== "committing" && review?.canCommit === true;

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
      {review && preview ? <SessionImportReviewCard review={review} summary={preview.publication.summary} /> : null}
      <button className="btn btn-primary" type="button" disabled={!canCommit} onClick={onCommit}>
        {status === "committing" ? "가져온 기록 저장 중" : "가져온 기록 저장"}
      </button>
      <div className="tiny">현재 선택한 공개 범위: {recordVisibility}</div>
    </div>
  );
}

function SessionImportReviewCard({ review, summary }: { review: SessionImportReview; summary: string }) {
  return (
    <section
      className="surface-quiet"
      role="region"
      aria-label="세션 기록 미리보기"
      style={{ padding: 16, overflowWrap: "anywhere" }}
    >
      <div className="row-between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="stack" style={{ "--stack": "6px", minWidth: 0 } as CSSProperties}>
          <div className="eyebrow">미리보기</div>
          <div className="small">{review.sessionLabel}</div>
        </div>
        <span className={`rm-state rm-state--${review.statusTone}`}>{review.statusLabel}</span>
      </div>

      <div className="stack" style={{ "--stack": "10px", marginTop: 14 } as CSSProperties}>
        <p className="small" style={{ margin: 0 }}>
          {summary}
        </p>

        <ul className="tiny" style={{ display: "grid", gap: 8, margin: 0, paddingLeft: 18 }}>
          {review.replacementItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <div className="small">
          <span>{review.authorStatusLabel}</span>
          <span>
            {" "}
            · 매칭 {review.authorSummary.matchedCount}개 / 전체 {review.authorSummary.totalCount}개
          </span>
        </div>
        {review.authorSummary.unmatchedAuthors.length > 0 ? (
          <ul className="tiny" style={{ display: "grid", gap: 6, margin: 0, paddingLeft: 18 }}>
            {review.authorSummary.unmatchedAuthors.map((author) => (
              <li key={author}>{author}</li>
            ))}
          </ul>
        ) : null}

        <div className="small">
          {review.feedbackDocumentStatusLabel}
          <span className="tiny" style={{ display: "block", marginTop: 4, color: "var(--text-2)" }}>
            {review.feedbackDocumentLabel}
          </span>
        </div>

        {review.blockingMessages.length > 0 ? (
          <ul className="small" style={{ display: "grid", gap: 6, margin: 0, paddingLeft: 18, color: "var(--danger)" }}>
            {review.blockingMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
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
