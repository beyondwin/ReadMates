import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from "react";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { type HostNotificationDeliveryItem, maskRecipient, shortId } from "./notification-formatters";

export function RestoreNotificationDialog({
  item,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  item: HostNotificationDeliveryItem;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmButtonRef.current?.focus();

    return () => {
      previousFocus?.focus();
    };
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      onClose();
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
        aria-labelledby="restore-notification-title"
        className="surface"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ width: "min(460px, 100%)", padding: "24px" }}
      >
        <h2 id="restore-notification-title" style={{ margin: 0 }}>
          중단된 알림을 복구할까요?
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 18px" }}>
          {maskRecipient(item.recipientEmail)} 배송을 다시 대기 상태로 돌립니다.
        </p>
        <div className="surface-quiet" style={{ padding: 14 }}>
          <div className="tiny mono" style={{ color: "var(--text)" }}>
            {item.channel} · {item.status}
          </div>
          <div className="tiny" style={{ color: "var(--text-3)", marginTop: 4 }}>
            이벤트 {shortId(item.eventId)} · {Math.max(0, item.attemptCount)}회 시도 · {formatDateOnlyLabel(item.updatedAt)}
          </div>
        </div>
        {error ? (
          <p role="alert" className="small" style={{ color: "var(--danger)", margin: "14px 0 0" }}>
            {error}
          </p>
        ) : null}
        <div className="actions" style={{ marginTop: "22px", justifyContent: "flex-end" }}>
          <button ref={cancelButtonRef} className="btn btn-ghost btn-sm" type="button" disabled={submitting} onClick={onClose}>
            취소
          </button>
          <button ref={confirmButtonRef} className="btn btn-primary btn-sm" type="button" disabled={submitting} onClick={onConfirm}>
            {submitting ? "복구 중" : "복구 확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
