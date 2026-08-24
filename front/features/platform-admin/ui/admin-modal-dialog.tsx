import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

export type AdminModalDialogProps = {
  titleId: string;
  triggerRef: RefObject<HTMLElement | null>;
  onRequestClose(): void;
  children: ReactNode;
  className?: string;
  backdropTestId?: string;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusable(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element === dialog) return false;
    if (element.hidden || element.closest("[hidden]")) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    return true;
  });
}

export function AdminModalDialog({
  titleId,
  triggerRef,
  onRequestClose,
  children,
  className,
  backdropTestId = "admin-modal-dialog-backdrop",
}: AdminModalDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onRequestCloseRef = useRef(onRequestClose);

  useLayoutEffect(() => {
    onRequestCloseRef.current = onRequestClose;
  }, [onRequestClose]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trigger = triggerRef.current;

    const inactivated: HTMLElement[] = [];
    for (const node of Array.from(document.body.children)) {
      if (!(node instanceof HTMLElement) || node === overlay) continue;
      if (node.hasAttribute("inert")) continue;
      node.setAttribute("inert", "");
      inactivated.push(node);
    }

    const focusable = getFocusable(dialog);
    if (focusable[0]) {
      focusable[0].focus();
    } else {
      dialog.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onRequestCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = getFocusable(dialog);
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      const inside = active instanceof Node && dialog.contains(active);

      if (!inside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      for (const node of inactivated) {
        node.removeAttribute("inert");
      }
      if (trigger?.isConnected) {
        trigger.focus();
      }
    };
  }, [triggerRef]);

  return createPortal(
    <div ref={overlayRef} className="admin-modal-dialog" role="presentation">
      <div
        className="admin-modal-dialog__backdrop"
        data-testid={backdropTestId}
        aria-hidden="true"
        onClick={() => onRequestCloseRef.current()}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={["admin-modal-dialog__panel", className].filter(Boolean).join(" ")}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
