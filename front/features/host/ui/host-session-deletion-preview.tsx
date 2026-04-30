"use client";

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  useEffect,
  useRef,
} from "react";
import type { HostSessionDeletionPreviewResponse } from "@/features/host/ui/host-ui-types";

type HostSessionDeletionPreviewDialogProps = {
  preview: HostSessionDeletionPreviewResponse | null;
  previewLoading: boolean;
  error: string | null;
  submitting: boolean;
  restoreFocusRef: MutableRefObject<HTMLElement | null>;
  onClose: () => void;
  onConfirm: () => void;
};

export function HostSessionDeletionPreviewDialog({
  preview,
  previewLoading,
  error,
  submitting,
  restoreFocusRef,
  onClose,
  onConfirm,
}: HostSessionDeletionPreviewDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const focusTarget = cancelButtonRef.current ?? confirmButtonRef.current ?? dialogRef.current;
    focusTarget?.focus();

    return () => {
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [restoreFocusRef]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!submitting) {
        event.preventDefault();
        onClose();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableButtons = [cancelButtonRef.current, confirmButtonRef.current].filter(
      (button): button is HTMLButtonElement => Boolean(button && !button.disabled),
    );

    if (focusableButtons.length === 0) {
      event.preventDefault();
      return;
    }

    if (focusableButtons.length === 1) {
      event.preventDefault();
      focusableButtons[0].focus();
      return;
    }

    const firstButton = focusableButtons[0];
    const lastButton = focusableButtons[focusableButtons.length - 1];
    const activeElement = document.activeElement;
    const focusIsInsideDialog = activeElement instanceof Node && Boolean(dialogRef.current?.contains(activeElement));

    if (event.shiftKey) {
      if (activeElement === firstButton || !focusIsInsideDialog) {
        event.preventDefault();
        lastButton.focus();
      }
      return;
    }

    if (activeElement === lastButton || !focusIsInsideDialog) {
      event.preventDefault();
      firstButton.focus();
    }
  };

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22, 24, 29, 0.46)",
        zIndex: 70,
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-session-title"
        className="surface"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ width: "min(460px, 100%)", padding: "24px" }}
      >
        <h2 id="delete-session-title" style={{ margin: 0 }}>
          이 세션을 삭제할까요?
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 18px" }}>
          삭제하면 이 회차와 준비 기록이 모두 제거됩니다. 멤버 계정과 멤버십은 삭제되지 않습니다.
        </p>

        {previewLoading ? (
          <p className="small" style={{ margin: "0 0 18px" }}>
            삭제할 데이터를 확인하고 있습니다.
          </p>
        ) : null}

        {error ? (
          <p className="small" style={{ color: "var(--danger)", margin: "0 0 18px" }}>
            {error}
          </p>
        ) : null}

        {preview ? <DeletionPreviewCounts preview={preview} /> : null}

        {preview && !preview.canDelete ? (
          <p className="small" role="alert" style={{ color: "var(--danger)", margin: "18px 0 0" }}>
            닫히거나 공개된 세션은 삭제할 수 없습니다. 기록 보존을 위해 위험 작업이 잠겨 있습니다.
          </p>
        ) : null}

        <div
          className="actions"
          style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "22px", justifyContent: "flex-end" }}
        >
          <button
            ref={cancelButtonRef}
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={submitting}
            onClick={onClose}
          >
            취소
          </button>
          <button
            ref={confirmButtonRef}
            className="btn btn-primary btn-sm"
            type="button"
            disabled={!preview || !preview.canDelete || previewLoading || submitting}
            onClick={onConfirm}
            style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
          >
            세션 삭제
          </button>
        </div>
      </div>
    </div>
  );
}

function DeletionPreviewCounts({ preview }: { preview: HostSessionDeletionPreviewResponse }) {
  const rows = [
    ["참석 대상", `${preview.counts.participants}명`],
    ["RSVP 응답", `${preview.counts.rsvpResponses}개`],
    ["질문", `${preview.counts.questions}개`],
    ["체크인", `${preview.counts.checkins}개`],
    ["한줄평", `${preview.counts.oneLineReviews}개`],
    ["장문평", `${preview.counts.longReviews}개`],
    ["하이라이트", `${preview.counts.highlights}개`],
    ["공개 요약", `${preview.counts.publications}개`],
    ["레거시 개인 피드백", `${preview.counts.feedbackReports}개`],
    ["회차 피드백 문서", `${preview.counts.feedbackDocuments}개`],
  ];

  return (
    <div className="stack" style={{ "--stack": "8px" } as CSSProperties}>
      {rows.map(([label, value]) => (
        <div className="row-between small" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
