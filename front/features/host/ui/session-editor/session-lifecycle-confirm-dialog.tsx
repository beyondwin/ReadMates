import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  useEffect,
  useRef,
} from "react";
import type { SessionLifecycleConfirmCopy } from "../../model/host-session-lifecycle-model";

export type SessionLifecycleConfirmDialogProps = {
  copy: SessionLifecycleConfirmCopy;
  errorMessage: string | null;
  openSessionHref: string | null;
  submitting: boolean;
  restoreFocusRef: MutableRefObject<HTMLElement | null>;
  onClose: () => void;
  onConfirm: () => void;
};

export function SessionLifecycleConfirmDialog({
  copy,
  errorMessage,
  openSessionHref,
  submitting,
  restoreFocusRef,
  onClose,
  onConfirm,
}: SessionLifecycleConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const openSessionLinkRef = useRef<HTMLAnchorElement>(null);

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

    const focusableElements = [
      openSessionLinkRef.current,
      cancelButtonRef.current,
      confirmButtonRef.current,
    ].filter((element): element is HTMLElement => {
      if (!element) {
        return false;
      }
      return !(element instanceof HTMLButtonElement && element.disabled);
    });

    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    if (focusableElements.length === 1) {
      event.preventDefault();
      focusableElements[0].focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const focusIsInsideDialog = activeElement instanceof Node && Boolean(dialogRef.current?.contains(activeElement));

    if (event.shiftKey) {
      if (activeElement === firstElement || !focusIsInsideDialog) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (activeElement === lastElement || !focusIsInsideDialog) {
      event.preventDefault();
      firstElement.focus();
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
        aria-labelledby="session-lifecycle-confirm-title"
        className="surface"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ width: "min(460px, 100%)", padding: "24px" }}
      >
        <h2 id="session-lifecycle-confirm-title" style={{ margin: 0 }}>
          {copy.title}
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 18px" }}>
          {copy.body}
        </p>

        {errorMessage ? (
          <p className="small" role="alert" style={{ color: "var(--danger)", margin: "0 0 18px" }}>
            {errorMessage}
          </p>
        ) : null}

        {openSessionHref ? (
          <p className="small" style={{ margin: "0 0 18px" }}>
            <a ref={openSessionLinkRef} href={openSessionHref}>
              진행 중인 세션 열기
            </a>
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
            onClick={() => {
              if (!submitting) {
                onClose();
              }
            }}
          >
            취소
          </button>
          <button
            ref={confirmButtonRef}
            className="btn btn-primary btn-sm"
            type="button"
            disabled={submitting}
            onClick={onConfirm}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
