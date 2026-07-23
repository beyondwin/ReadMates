import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export type NotificationDecision = "SEND" | "SKIP";

export type HostActionPreview = {
  previewId: string;
  targetCount: number;
  expectedInAppCount: number;
  expectedEmailCount: number;
  excludedCount: number;
  expiresAt: string;
};

export type HostActionConfirmationDialogProps = {
  open: boolean;
  preview: HostActionPreview | null;
  decision: NotificationDecision | null;
  submitting: boolean;
  onDecisionChange: (decision: NotificationDecision) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const actionStyle: CSSProperties = {
  flex: "1 1 132px",
  minWidth: 0,
  whiteSpace: "nowrap",
};

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  ));
}

export function HostActionConfirmationDialog({
  open,
  preview,
  decision,
  submitting,
  onDecisionChange,
  onCancel,
  onConfirm,
}: HostActionConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !preview || !dialogRef.current) {
      return;
    }
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusableElements(dialogRef.current)[0]?.focus();
    return () => {
      trigger?.focus();
    };
  }, [open, preview]);

  if (!open || !preview) {
    return null;
  }

  const sendDisabled = submitting || preview.targetCount === 0;
  const confirmDisabled = submitting || decision === null || (decision === "SEND" && sendDisabled);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const elements = focusableElements(event.currentTarget);
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
        aria-labelledby="host-action-confirmation-title"
        aria-describedby="host-action-confirmation-description"
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
        <div>
          <div className="eyebrow">알림 확인</div>
          <h2 id="host-action-confirmation-title" className="h3" style={{ margin: "6px 0 0" }}>
            반영 방법을 선택해 주세요
          </h2>
        </div>
        <p id="host-action-confirmation-description" className="small" style={{ margin: 0 }}>
          콘텐츠 반영과 알림 결정을 함께 처리합니다. 미리보기 대상 {preview.targetCount}명,
          앱 {preview.expectedInAppCount}건, 이메일 {preview.expectedEmailCount}건입니다.
        </p>
        {preview.excludedCount > 0 ? (
          <p className="tiny" style={{ margin: 0 }}>제외 대상 {preview.excludedCount}명</p>
        ) : null}

        <fieldset
          aria-required="true"
          className="stack"
          style={{ "--stack": "10px", border: 0, padding: 0, margin: 0 } as CSSProperties}
        >
          <legend className="field-label">필수 선택</legend>
          <label className="surface-quiet row" style={{ gap: 10, padding: 14 }}>
            <input
              type="radio"
              aria-label="알림 보내고 반영"
              name="host-action-notification-decision"
              required
              checked={decision === "SEND"}
              disabled={sendDisabled}
              onChange={() => onDecisionChange("SEND")}
            />
            <span>
              <strong className="body">알림 보내고 반영</strong>
              <span className="tiny" style={{ display: "block", marginTop: 3 }}>
                확인된 대상에게 앱·이메일 알림을 생성합니다.
              </span>
            </span>
          </label>
          {preview.targetCount === 0 ? (
            <div className="tiny" role="note">알림 대상이 없어 SEND를 선택할 수 없습니다.</div>
          ) : null}
          <label className="surface-quiet row" style={{ gap: 10, padding: 14 }}>
            <input
              type="radio"
              aria-label="알림 없이 반영"
              name="host-action-notification-decision"
              required
              checked={decision === "SKIP"}
              disabled={submitting}
              onChange={() => onDecisionChange("SKIP")}
            />
            <span>
              <strong className="body">알림 없이 반영</strong>
              <span className="tiny" style={{ display: "block", marginTop: 3 }}>
                콘텐츠만 반영하고 SKIP 결정을 장부에 남깁니다.
              </span>
            </span>
          </label>
        </fieldset>

        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            className="btn btn-quiet"
            type="button"
            style={actionStyle}
            disabled={submitting}
            onClick={onCancel}
          >
            취소
          </button>
          <button
            className="btn btn-primary"
            type="button"
            style={actionStyle}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {submitting ? "반영 중" : "선택대로 반영"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
