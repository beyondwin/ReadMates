"use client";

import { Link } from "@/src/app/router-link";
import type { ChangeEventHandler, RefObject } from "react";

type FeedbackDocumentUploadStatus = {
  uploaded: boolean;
  fileName: string | null;
};

type HostSessionFeedbackUploadProps = {
  sessionId?: string;
  feedbackDocument: FeedbackDocumentUploadStatus;
  inputRef: RefObject<HTMLInputElement | null>;
  emptyMessage: string;
  onUploadFeedbackDocument: ChangeEventHandler<HTMLInputElement>;
};

export function HostSessionFeedbackUpload({
  sessionId,
  feedbackDocument,
  inputRef,
  emptyMessage,
  onUploadFeedbackDocument,
}: HostSessionFeedbackUploadProps) {
  if (!sessionId) {
    return (
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      <div className="marginalia" style={{ marginBottom: "12px" }}>
        회차별 피드백 문서 원본을 업로드하세요. 참석 멤버는 피드백 화면에서 문서를 확인하고 PDF로 저장할 수
        있어요.
      </div>
      <div className="surface-quiet" style={{ padding: "22px", borderStyle: "dashed" }}>
        <div className="row-between" style={{ alignItems: "flex-start", gap: "18px", flexWrap: "wrap" }}>
          <div>
            <span className={feedbackDocument.uploaded ? "badge badge-ok badge-dot" : "badge"}>
              {feedbackDocument.uploaded ? "업로드 완료" : "미등록"}
            </span>
            <div className="body" style={{ fontSize: "14px", marginTop: "12px" }}>
              {feedbackDocument.fileName ?? "업로드된 피드백 문서가 없습니다."}
            </div>
            <div className="tiny" style={{ marginTop: "4px", color: "var(--text-3)" }}>
              <code className="mono">.md</code> 또는 <code className="mono">.txt</code> 파일을 업로드하세요.
            </div>
          </div>
          <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
            {feedbackDocument.uploaded ? (
              <Link className="btn btn-quiet btn-sm" to={`/app/feedback/${sessionId}`}>
                미리보기
              </Link>
            ) : null}
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              {feedbackDocument.uploaded ? "교체" : "등록"}
            </button>
          </div>
        </div>
        <div style={{ marginTop: "16px" }}>
          <label className="label" htmlFor="feedback-document-file">
            피드백 문서 파일
          </label>
          <input
            ref={inputRef}
            id="feedback-document-file"
            className="input"
            type="file"
            accept=".md,.txt"
            onChange={onUploadFeedbackDocument}
          />
        </div>
      </div>
    </>
  );
}
