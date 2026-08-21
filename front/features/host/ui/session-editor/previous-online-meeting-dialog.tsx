import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  useEffect,
  useRef,
} from "react";
import type { PreviousOnlineMeeting } from "@/features/host/model/host-schedule-defaults-model";

export type PreviousOnlineMeetingDialogProps = {
  previous: PreviousOnlineMeeting;
  restoreFocusRef: MutableRefObject<HTMLElement | null>;
  onClose: () => void;
  onAdopt: (next: { meetingUrl: string; meetingPasscode: string }) => void;
};

export function PreviousOnlineMeetingDialog({
  previous,
  restoreFocusRef,
  onClose,
  onAdopt,
}: PreviousOnlineMeetingDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const hasPasscode = Boolean(previous.meetingPasscode);

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
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableButtons = [cancelButtonRef.current, confirmButtonRef.current].filter(
      (button): button is HTMLButtonElement => Boolean(button),
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
        aria-labelledby="previous-online-meeting-title"
        className="surface"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ width: "min(460px, 100%)", padding: "24px" }}
      >
        <h2 id="previous-online-meeting-title" style={{ margin: 0 }}>
          이전 온라인 모임 정보
        </h2>
        <dl className="stack" style={{ margin: "14px 0 0", "--stack": "10px" } as CSSProperties}>
          <div>
            <dt className="tiny" style={{ color: "var(--text-3)" }}>미팅 URL</dt>
            <dd className="small" style={{ margin: "4px 0 0", overflowWrap: "anywhere" }}>
              {previous.meetingUrl}
            </dd>
          </div>
          <div>
            <dt className="tiny" style={{ color: "var(--text-3)" }}>Passcode</dt>
            <dd className="small" style={{ margin: "4px 0 0" }}>
              {hasPasscode ? "있음" : "없음"}
            </dd>
          </div>
        </dl>
        <div
          className="actions"
          style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "22px", justifyContent: "flex-end" }}
        >
          <button
            ref={cancelButtonRef}
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={onClose}
          >
            취소
          </button>
          <button
            ref={confirmButtonRef}
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => {
              onAdopt({
                meetingUrl: previous.meetingUrl,
                meetingPasscode: previous.meetingPasscode ?? "",
              });
              onClose();
            }}
          >
            현재 모임에 적용
          </button>
        </div>
      </div>
    </div>
  );
}
