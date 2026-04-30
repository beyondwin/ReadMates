"use client";

import type { ChangeEventHandler, ComponentType, ReactNode, RefObject } from "react";

type FeedbackDocumentUploadStatus = {
  uploaded: boolean;
  fileName: string | null;
};

type ReadmatesReturnState = {
  readmatesReturnTo: string;
  readmatesReturnLabel: string;
  readmatesReturnState?: ReadmatesReturnState;
};

type FeedbackUploadLinkProps = {
  to: string;
  state?: unknown;
  className?: string;
  children: ReactNode;
};

type HostSessionFeedbackUploadProps = {
  sessionId?: string;
  feedbackDocument: FeedbackDocumentUploadStatus;
  inputRef: RefObject<HTMLInputElement | null>;
  emptyMessage: string;
  previewState?: ReadmatesReturnState;
  LinkComponent: ComponentType<FeedbackUploadLinkProps>;
  onUploadFeedbackDocument: ChangeEventHandler<HTMLInputElement>;
};

export function HostSessionFeedbackUpload({
  sessionId,
  feedbackDocument,
  inputRef,
  emptyMessage,
  previewState,
  LinkComponent,
  onUploadFeedbackDocument,
}: HostSessionFeedbackUploadProps) {
  if (!sessionId) {
    return (
      <div className="surface-quiet" style={{ padding: "18px" }}>
        <span className="badge">등록 불가</span>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 0" }}>
          {emptyMessage}
        </p>
        <p className="tiny" style={{ margin: "6px 0 0", color: "var(--text-3)" }}>
          피드백 문서는 세션이 서버에 저장된 뒤 해당 세션 ID에 연결됩니다.
        </p>
      </div>
    );
  }

  const statusLabel = feedbackDocument.uploaded ? "업로드 완료" : "미등록";
  const fileLabel = feedbackDocument.fileName ?? "파일 없음";

  return (
    <>
      <div className="surface-quiet rm-feedback-upload">
        <div className="rm-feedback-upload__summary">
          <div className="rm-feedback-upload__copy">
            <div className="rm-feedback-upload__meta">
              <span className={feedbackDocument.uploaded ? "badge badge-ok badge-dot" : "badge"}>{statusLabel}</span>
              <span className="tiny rm-feedback-upload__format">
                <code className="mono">.md</code>
                <span aria-hidden="true"> · </span>
                <code className="mono">.txt</code>
              </span>
            </div>
            <p className="rm-feedback-upload__file">{fileLabel}</p>
          </div>
          <div className="rm-feedback-upload__actions">
            {feedbackDocument.uploaded ? (
              <LinkComponent className="btn btn-quiet btn-sm" to={`/app/feedback/${encodeURIComponent(sessionId)}`} state={previewState}>
                미리보기
              </LinkComponent>
            ) : null}
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => inputRef.current?.click()}>
              {feedbackDocument.uploaded ? "교체" : "등록"}
            </button>
          </div>
        </div>
        <label className="label rm-sr-only" htmlFor="feedback-document-file">
          피드백 문서 파일
        </label>
        <input
          ref={inputRef}
          id="feedback-document-file"
          className="rm-sr-only"
          type="file"
          accept=".md,.txt"
          onChange={onUploadFeedbackDocument}
        />
      </div>
      <style>{`
        .rm-feedback-upload {
          padding: 18px;
        }
        .rm-feedback-upload__summary {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 18px;
        }
        .rm-feedback-upload__copy {
          min-width: 0;
        }
        .rm-feedback-upload__meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .rm-feedback-upload__format {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: var(--text-3);
        }
        .rm-feedback-upload__file {
          margin: 10px 0 0;
          color: var(--text);
          font-size: 14px;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }
        .rm-feedback-upload__actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        @media (max-width: 768px) {
          .rm-feedback-upload {
            padding: 16px !important;
          }
          .rm-feedback-upload__summary {
            grid-template-columns: minmax(0, 1fr);
            gap: 14px;
          }
          .rm-feedback-upload__actions {
            justify-content: stretch;
          }
          .rm-feedback-upload__actions .btn {
            flex: 1 1 120px;
          }
        }
      `}</style>
    </>
  );
}
