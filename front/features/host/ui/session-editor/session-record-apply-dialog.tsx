import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { recordVisibilityLabel, type SessionRecordVisibility } from "@/features/host/model/host-session-editor-model";

export type HostSessionRecordApplyReview = {
  eventType: "FEEDBACK_DOCUMENT_PUBLISHED" | "SESSION_RECORD_UPDATED";
  changedSections: string[];
  liveRevision: number;
  nextLiveRevision: number;
  draftRevision: number;
  visibility: SessionRecordVisibility;
};

export type SessionRecordApplyDialogProps = {
  open: boolean;
  preview: HostSessionRecordApplyReview | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function dialogFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  ));
}

export function SessionRecordApplyDialog({
  open,
  preview,
  submitting,
  onCancel,
  onConfirm,
}: SessionRecordApplyDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !preview || !dialogRef.current) {
      return;
    }
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogFocusableElements(dialogRef.current)[0]?.focus();
    return () => {
      trigger?.focus();
    };
  }, [open, preview]);

  if (!open || !preview) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const elements = dialogFocusableElements(event.currentTarget);
    if (elements.length === 0) {
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="rm-host-action-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-record-apply-title"
        aria-describedby="session-record-apply-description"
        className="rm-host-action-dialog-sheet stack"
        data-testid="host-action-dialog-sheet"
        onKeyDown={handleKeyDown}
        style={{
          "--stack": "16px",
          width: "min(480px, calc(100vw - 24px))",
          maxWidth: "100%",
          maxHeight: "calc(100dvh - 24px)",
          overflowY: "auto",
        } as CSSProperties}
      >
        <div className="row-between" style={{ gap: 12, alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow">작성 중</div>
            <h2 id="session-record-apply-title" className="h3" style={{ margin: "6px 0 0" }}>
              반영 전 확인
            </h2>
          </div>
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={submitting}
            onClick={onCancel}
          >
            닫기
          </button>
        </div>
        <p id="session-record-apply-description" className="small" style={{ margin: 0 }}>
          저장된 작성 중 내용을 멤버에게 보이는 기록으로 올립니다.
        </p>
        <section className="surface-quiet stack" style={{ "--stack": "10px", padding: 14 } as CSSProperties}>
          <div className="field-label">버전</div>
          <div className="small">
            {preview.liveRevision > 0
              ? `버전 ${preview.liveRevision} → 버전 ${preview.nextLiveRevision}`
              : `현재 적용본 없음 → 버전 ${preview.nextLiveRevision}`}
          </div>
          <div className="field-label">변경 항목</div>
          {preview.changedSections.length > 0 ? (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {preview.changedSections.map((section) => <li key={section}>{section}</li>)}
            </ul>
          ) : (
            <p className="small" style={{ margin: 0 }}>정규화된 초안 내용을 반영합니다.</p>
          )}
          <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
            <span className="field-label">공개 범위</span>
            <strong className="small">{recordVisibilityLabel(preview.visibility)}</strong>
          </div>
        </section>
        <p className="small" style={{ margin: 0 }}>
          이 단계에서는 알림을 만들거나 보내지 않습니다
        </p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            className="btn btn-quiet"
            type="button"
            disabled={submitting}
            onClick={onCancel}
          >
            나중
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={submitting}
            onClick={onConfirm}
          >
            {submitting ? "반영하는 중" : "멤버에게 반영"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
