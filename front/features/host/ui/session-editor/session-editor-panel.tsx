import type { ReactNode } from "react";
import { mobileEditorSectionConfig, type MobileEditorSection } from "./mobile-editor-tabs";

export function Panel({
  eyebrow,
  title,
  children,
  tone,
  mobileSection,
  panelId,
  activeMobileSection,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  tone?: "warn";
  mobileSection: MobileEditorSection;
  panelId: string;
  activeMobileSection: MobileEditorSection;
}) {
  const warn = tone === "warn";
  const isMobileActive = mobileSection === activeMobileSection;
  const sectionConfig = mobileEditorSectionConfig(mobileSection);

  return (
    <section
      id={panelId}
      role="tabpanel"
      aria-labelledby={sectionConfig.tabId}
      className={`surface rm-host-session-editor__section${isMobileActive ? " is-mobile-active" : ""}`}
      data-mobile-editor-section={mobileSection}
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
