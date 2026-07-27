import type { JSX, ReactNode } from "react";
import type { HostSessionEditorSection } from "../../model/host-session-editor-navigation";
import { mobileEditorSectionConfig, type MobileEditorSection } from "./mobile-editor-tabs";

type PanelBaseProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
  tone?: "warn";
  panelId: string;
};

type SectionPanelProps = PanelBaseProps & {
  section: HostSessionEditorSection;
  activeSection: HostSessionEditorSection;
};

type LegacyMobilePanelProps = PanelBaseProps & {
  mobileSection: MobileEditorSection;
  activeMobileSection: MobileEditorSection;
};

export function Panel(props: SectionPanelProps | LegacyMobilePanelProps): JSX.Element {
  const {
    eyebrow,
    title,
    children,
    tone,
    panelId,
  } = props;
  const warn = tone === "warn";
  const usesSectionNavigation = "section" in props;
  const section = usesSectionNavigation ? props.section : props.mobileSection;
  const isActive = usesSectionNavigation
    ? props.section === props.activeSection
    : props.mobileSection === props.activeMobileSection;
  const labelledBy = usesSectionNavigation
    ? `host-editor-tab-${props.section}`
    : mobileEditorSectionConfig(props.mobileSection).tabId;

  return (
    <section
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      hidden={usesSectionNavigation && !isActive}
      className={`surface rm-host-session-editor__section ${isActive ? "is-active is-mobile-active" : "is-inactive"}`}
      data-editor-section={section}
      data-mobile-editor-section={usesSectionNavigation ? undefined : props.mobileSection}
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
