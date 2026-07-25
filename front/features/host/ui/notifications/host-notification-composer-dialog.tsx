import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";

export type HostNotificationComposerDialogProps = {
  open: boolean;
  busy: boolean;
  variant?: "centered" | "side-sheet";
  title?: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
};

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function HostNotificationComposerDialog({
  open,
  busy,
  variant = "centered",
  title = "알림 보내기",
  description = "대상과 채널을 확인한 뒤에만 알림이 발송됩니다.",
  children,
  onClose,
}: HostNotificationComposerDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      if (!busy) {
        event.preventDefault();
        onClose();
      }
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const actions = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element !== dialog);
    const focusOrder = [dialog, ...actions];
    const first = focusOrder[0];
    const last = focusOrder[focusOrder.length - 1];
    const currentIndex = focusOrder.indexOf(document.activeElement as HTMLElement);

    if (event.shiftKey && (currentIndex <= 0)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (currentIndex === focusOrder.length - 1 || currentIndex === -1)) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (!busy && event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      role="presentation"
      data-testid="host-notification-composer-backdrop"
      className={[
        "host-notification-composer-scrim",
        variant === "side-sheet" ? "host-notification-composer-scrim--side-sheet" : "",
      ].filter(Boolean).join(" ")}
      onMouseDown={handleBackdrop}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="host-notification-composer-dialog-title"
        aria-describedby="host-notification-composer-dialog-description"
        tabIndex={-1}
        className={[
          "surface",
          "host-notification-composer-dialog",
          variant === "side-sheet" ? "host-notification-composer-dialog--side-sheet" : "",
        ].filter(Boolean).join(" ")}
        onKeyDown={handleKeyDown}
      >
        <div className="sr-only">
          <h2 id="host-notification-composer-dialog-title">{title}</h2>
          <p id="host-notification-composer-dialog-description">{description}</p>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
