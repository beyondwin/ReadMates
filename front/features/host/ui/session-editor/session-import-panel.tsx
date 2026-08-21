import { type ChangeEvent, type CSSProperties, type DragEvent, useId, useRef } from "react";
import type {
  SessionImportPreviewResponse,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import {
  buildSessionImportReview,
  sessionImportReplacementWarning,
  type SessionImportReview,
} from "@/features/host/model/session-import-model";
import { compatibilityExposureLabel } from "@/features/host/model/session-exposure-model";

export type SessionImportPanelBodyProps = {
  sessionId: string | undefined;
  recordVisibility: SessionRecordVisibility;
  preview: SessionImportPreviewResponse | null;
  status: "idle" | "previewing" | "ready" | "committing" | "error";
  error: string | null;
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onCommit: () => void;
  onSetGuestReadable?: () => void;
};

export function SessionImportPanelBody({
  sessionId,
  recordVisibility,
  preview,
  status,
  error,
  onFileSelected,
  onCommit,
  onSetGuestReadable,
}: SessionImportPanelBodyProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const review = preview ? buildSessionImportReview(preview, recordVisibility) : null;
  const canCommit = Boolean(sessionId) && status === "ready" && review?.canCommit === true;
  const hostOnlyBlocked = recordVisibility === "HOST_ONLY";
  const busy = status === "previewing" || status === "committing";

  const assignDroppedFile = (file: File) => {
    const input = fileInputRef.current;
    if (!input || !sessionId || busy) {
      return;
    }
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
    } catch {
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
    }
    onFileSelected({
      currentTarget: input,
      target: input,
    } as ChangeEvent<HTMLInputElement>);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      assignDroppedFile(file);
    }
  };

  return (
    <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
      <div className="small" style={{ color: "var(--text-2)" }}>
        {sessionId
          ? sessionImportReplacementWarning()
          : "모임을 만든 뒤 정리본을 올릴 수 있습니다."}
      </div>
      <label
        className="rm-session-import-drop"
        htmlFor={fileInputId}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={handleDrop}
        style={{
          display: "grid",
          gap: 10,
          alignContent: "center",
          justifyItems: "start",
          minHeight: 128,
          padding: 18,
          border: "1px dashed var(--line)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-sub)",
          color: "var(--text-2)",
        }}
      >
        <span className="small" style={{ color: "var(--text)" }}>
          정리한 파일을 여기에 놓으세요
        </span>
        <input
          ref={fileInputRef}
          id={fileInputId}
          className="rm-sr-only"
          type="file"
          accept="application/json,.json"
          aria-label="정리한 파일을 여기에 놓으세요"
          disabled={!sessionId || busy}
          onChange={onFileSelected}
        />
      </label>
      {status === "previewing" ? (
        <div className="small" role="status">
          올린 파일을 확인하고 있습니다.
        </div>
      ) : null}
      {error ? (
        <div className="small" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}
      {review && preview ? <SessionImportReviewCard review={review} summary={preview.publication.summary} /> : null}
      {hostOnlyBlocked && onSetGuestReadable ? (
        <button className="btn btn-quiet btn-sm" type="button" onClick={onSetGuestReadable}>
          게스트와 멤버에게 보이기로 바꾸기
        </button>
      ) : null}
      <button className="btn btn-primary" type="button" disabled={!canCommit} onClick={onCommit}>
        {status === "committing" ? "작성 중에 넣는 중" : "작성 중에 넣기"}
      </button>
      <div className="tiny">현재 선택한 게스트 접근: {compatibilityExposureLabel[recordVisibility]}</div>
    </div>
  );
}

function SessionImportReviewCard({ review, summary }: { review: SessionImportReview; summary: string }) {
  return (
    <section
      className="surface-quiet"
      role="region"
      aria-label="정리본 미리보기"
      style={{ padding: 16, minWidth: 0, overflowWrap: "anywhere" }}
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
