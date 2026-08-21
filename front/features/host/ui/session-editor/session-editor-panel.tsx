import type { JSX, ReactNode } from "react";
import type { HostSessionEditorSection } from "../../model/host-session-editor-navigation";

type PanelProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
  tone?: "warn";
  panelId: string;
  section: HostSessionEditorSection;
  activeSection: HostSessionEditorSection;
};

export function Panel(props: PanelProps): JSX.Element {
  const {
    eyebrow,
    title,
    children,
    tone,
    panelId,
  } = props;
  const warn = tone === "warn";
  const isActive = props.section === props.activeSection;

  return (
    <section
      id={panelId}
      hidden={!isActive}
      className={`surface rm-host-session-editor__section ${isActive ? "is-active is-mobile-active" : "is-inactive"}`}
      data-editor-section={props.section}
      style={{
        padding: "28px",
        borderColor: warn ? "color-mix(in oklch, var(--warn), var(--line) 70%)" : "var(--line)",
      }}
    >
      <div className="row-between" style={{ marginBottom: "18px" }}>
        <div>
          <div className="eyebrow" style={{ color: warn ? "var(--warn)" : "var(--text-3)" }}>
            {eyebrow}
          </div>
          <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>
            {title}
          </h2>
        </div>
      </div>
      {children}
    </section>
  );
}
