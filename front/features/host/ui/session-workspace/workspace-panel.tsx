import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
].join(", ");

function visibleFocusable(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.closest("[hidden]"));
}

function restoreOrigin(origin: HTMLElement | null) {
  if (!origin?.isConnected || origin.closest("[hidden]")) return;
  origin.focus();
}

export function WorkspacePanel({
  id,
  title,
  eyebrow,
  expanded,
  onToggle,
  children,
  variant = "inline",
}: {
  id: string;
  title: string;
  eyebrow?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  variant?: "inline" | "sheet";
}) {
  const contentId = `${id}-content`;
  const titleId = `${id}-title`;
  const panelRef = useRef<HTMLElement>(null);
  const originRef = useRef<HTMLElement | null>(null);
  const isSheet = variant === "sheet";

  useLayoutEffect(() => {
    if (!expanded) return undefined;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (active && !panelRef.current?.contains(active)) {
      originRef.current = active;
    }
    if (isSheet && panelRef.current) {
      const first = visibleFocusable(panelRef.current)
        .find((element) => element.getAttribute("aria-controls") !== contentId)
        ?? visibleFocusable(panelRef.current)[0];
      first?.focus();
    }
    return () => {
      restoreOrigin(originRef.current);
    };
  }, [contentId, expanded, isSheet]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const nestedModals = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (isSheet) {
        if (nestedModals.length > 1) return;
      } else if (nestedModals.length > 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      restoreOrigin(originRef.current);
      onToggle();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [expanded, isSheet, onToggle]);

  const handleSheetKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!isSheet || event.key !== "Tab" || !panelRef.current) return;
    const focusable = visibleFocusable(panelRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const header = (
    <div className="rm-workspace-panel__header">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h2 id={titleId} className="h3 editorial">{title}</h2>
      </div>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
      >
        {expanded ? "접기" : "열기"}
      </button>
    </div>
  );

  if (isSheet) {
    return (
      <div
        className="rm-host-session-workspace__sheet-backdrop"
        hidden={!expanded}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onToggle();
        }}
      >
        <section
          ref={panelRef}
          id={id}
          className={`rm-workspace-panel rm-workspace-panel--sheet rm-host-session-workspace__sheet rm-host-session-workspace__sheet--bottom${expanded ? " is-expanded" : ""}`}
          role="dialog"
          aria-modal={expanded}
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={handleSheetKeyDown}
        >
          {header}
          <div id={contentId} hidden={!expanded} className="rm-workspace-panel__body">
            {children}
          </div>
        </section>
      </div>
    );
  }

  return (
    <section
      id={id}
      className={`rm-workspace-panel rm-workspace-panel--inline${expanded ? " is-expanded" : ""}`}
      aria-labelledby={titleId}
    >
      {header}
      <div id={contentId} hidden={!expanded} className="rm-workspace-panel__body">
        {children}
      </div>
    </section>
  );
}
