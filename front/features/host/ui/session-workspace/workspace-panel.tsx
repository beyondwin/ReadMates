import type { ReactNode } from "react";

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

  return (
    <section
      id={id}
      className={`rm-workspace-panel rm-workspace-panel--${variant}${expanded ? " is-expanded" : ""}`}
      aria-labelledby={titleId}
    >
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
      <div id={contentId} hidden={!expanded} className="rm-workspace-panel__body">
        {children}
      </div>
    </section>
  );
}
