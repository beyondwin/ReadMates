import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export type EvidenceDrawerProps = {
  open: boolean;
  targetLabel: string;
  onClose: () => void;
  children: ReactNode;
};

function focusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function EvidenceDrawer({ open, targetLabel, onClose, children }: EvidenceDrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog ? focusable(dialog)[0] : null;
    first?.focus();
    return () => previousFocusRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(22,24,29,.46)", display: "flex", alignItems: "flex-end" }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${targetLabel} 근거`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key !== "Tab" || !dialogRef.current) return;
          const items = focusable(dialogRef.current);
          if (items.length === 0) {
            event.preventDefault();
            dialogRef.current.focus();
            return;
          }
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        tabIndex={-1}
        className="surface"
        style={{ width: "100%", maxHeight: "82vh", overflowY: "auto", padding: 18, borderRadius: "18px 18px 0 0" } as CSSProperties}
      >
        <div className="row-between" style={{ marginBottom: 12 }}>
          <strong>{targetLabel} 근거</strong>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose} aria-label="근거 닫기">
            닫기
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
