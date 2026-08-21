import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  buildHostSessionReverseRequest,
  isReverseLifecycleKind,
  remainingReverseReasonNoteCount,
  SELECTABLE_REVERSE_REASON_OPTIONS,
  type HostSessionReverseRequest,
  type SessionLifecycleConfirmCopy,
} from "../../model/host-session-lifecycle-model";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
].join(", ");

export type SessionLifecycleConfirmDialogProps = {
  copy: SessionLifecycleConfirmCopy;
  errorMessage: string | null;
  openSessionHref: string | null;
  submitting: boolean;
  restoreFocusRef: MutableRefObject<HTMLElement | null>;
  onClose: () => void;
  onConfirm: (request?: HostSessionReverseRequest) => void;
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
  const reasonSelectRef = useRef<HTMLSelectElement>(null);
  const reasonNoteRef = useRef<HTMLTextAreaElement>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const reverse = isReverseLifecycleKind(copy.kind);
  const alertMessage = validationMessage ?? errorMessage;

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

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );

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

  const handleConfirm = () => {
    if (submitting) {
      return;
    }
    if (!reverse) {
      onConfirm();
      return;
    }
    const result = buildHostSessionReverseRequest({ reasonCode, reasonNote });
    if (!result.ok) {
      setValidationMessage(result.message);
      if (result.focus === "reason") {
        reasonSelectRef.current?.focus();
      } else {
        reasonNoteRef.current?.focus();
      }
      return;
    }
    setValidationMessage(null);
    onConfirm(result.request);
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

        {reverse ? (
          <div className="stack" style={{ "--stack": "14px", marginBottom: "18px" } as CSSProperties}>
            <div className="stack" style={{ "--stack": "6px" } as CSSProperties}>
              <label className="label" htmlFor="session-lifecycle-reason">변경 사유</label>
              <select
                ref={reasonSelectRef}
                id="session-lifecycle-reason"
                className="input"
                value={reasonCode}
                disabled={submitting}
                onChange={(event) => {
                  setReasonCode(event.currentTarget.value);
                  setValidationMessage(null);
                }}
              >
                <option value="">사유 선택</option>
                {SELECTABLE_REVERSE_REASON_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="stack" style={{ "--stack": "6px" } as CSSProperties}>
              <label className="label" htmlFor="session-lifecycle-reason-note">설명 (선택)</label>
              <textarea
                ref={reasonNoteRef}
                id="session-lifecycle-reason-note"
                className="input"
                rows={3}
                value={reasonNote}
                disabled={submitting}
                onChange={(event) => {
                  setReasonNote(event.currentTarget.value);
                  setValidationMessage(null);
                }}
                style={{ minWidth: 0, maxWidth: "100%", overflowWrap: "anywhere" }}
              />
              <span className="tiny" style={{ color: "var(--text-3)" }}>
                남은 글자 {remainingReverseReasonNoteCount(reasonNote)}
              </span>
            </div>
          </div>
        ) : null}

        {alertMessage ? (
          <p className="small" role="alert" style={{ color: "var(--danger)", margin: "0 0 18px" }}>
            {alertMessage}
          </p>
        ) : null}

        {openSessionHref ? (
          <p className="small" style={{ margin: "0 0 18px" }}>
            <a href={openSessionHref}>
              진행 중인 모임 열기
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
            onClick={handleConfirm}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
