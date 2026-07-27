import type { JSX, KeyboardEvent } from "react";
import type { HostSessionEditorSection } from "../../model/host-session-editor-navigation";

const sectionItems: readonly {
  key: HostSessionEditorSection;
  desktopLabel: string;
  mobileLabel: string;
  panelIds: readonly string[];
}[] = [
  {
    key: "overview",
    desktopLabel: "개요",
    mobileLabel: "개요",
    panelIds: ["host-editor-panel-overview"],
  },
  {
    key: "basic",
    desktopLabel: "기본 정보",
    mobileLabel: "기본",
    panelIds: ["host-editor-panel-basic-info", "host-editor-panel-basic-schedule"],
  },
  {
    key: "attendance",
    desktopLabel: "출석",
    mobileLabel: "출석",
    panelIds: ["host-editor-panel-attendance"],
  },
  {
    key: "records",
    desktopLabel: "기록 작업대",
    mobileLabel: "기록",
    panelIds: [
      "host-editor-record-source-panel-manual",
      "host-editor-record-source-panel-ai",
      "host-editor-record-source-panel-json",
    ],
  },
  {
    key: "history",
    desktopLabel: "변경 기록",
    mobileLabel: "변경",
    panelIds: ["host-editor-panel-history"],
  },
];

export function SessionEditorSectionNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: HostSessionEditorSection;
  onSectionChange: (section: HostSessionEditorSection) => void;
}): JSX.Element {
  return (
    <div
      className="m-hscroll rm-host-session-editor__section-nav"
      role="tablist"
      aria-label="호스트 편집 섹션"
      onKeyDown={(event) => handleSectionKeyDown(event, activeSection, onSectionChange)}
      style={{ gap: 6, padding: "0 0 6px" }}
    >
      {sectionItems.map((item) => {
        const selected = item.key === activeSection;

        return (
          <button
            key={item.key}
            id={tabId(item.key)}
            type="button"
            role="tab"
            aria-label={item.desktopLabel}
            aria-selected={selected}
            aria-controls={item.panelIds.join(" ")}
            tabIndex={selected ? 0 : -1}
            className={`m-chip${selected ? " is-on" : ""}`}
            onClick={() => onSectionChange(item.key)}
            style={{
              minHeight: 36,
              height: 36,
              padding: "0 15px",
              borderColor: selected ? "var(--text)" : "var(--line)",
              background: selected ? "var(--text)" : "transparent",
              color: selected ? "var(--bg)" : "var(--text-2)",
            }}
          >
            <span className="desktop-only" data-desktop-label aria-hidden="true">
              {item.desktopLabel}
            </span>
            <span className="mobile-only" data-mobile-label aria-hidden="true">
              {item.mobileLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function handleSectionKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  activeSection: HostSessionEditorSection,
  onSectionChange: (section: HostSessionEditorSection) => void,
) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  const currentIndex = sectionItems.findIndex((item) => item.key === activeSection);
  const lastIndex = sectionItems.length - 1;
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? lastIndex
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + sectionItems.length) % sectionItems.length
        : (currentIndex + 1) % sectionItems.length;
  const nextSection = sectionItems[nextIndex]?.key;

  if (!nextSection) {
    return;
  }

  onSectionChange(nextSection);
  document.getElementById(tabId(nextSection))?.focus();
}

function tabId(section: HostSessionEditorSection) {
  return `host-editor-tab-${section}`;
}
