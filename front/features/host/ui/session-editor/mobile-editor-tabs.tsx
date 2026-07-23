import type { KeyboardEvent } from "react";

export type MobileEditorSection = "basic" | "attendance" | "records" | "history";

export const mobileEditorSections: { key: MobileEditorSection; label: string; tabId: string; panelIds: string[] }[] = [
  {
    key: "basic",
    label: "기본",
    tabId: "host-editor-tab-basic",
    panelIds: ["host-editor-panel-basic-info", "host-editor-panel-basic-schedule"],
  },
  {
    key: "attendance",
    label: "출석",
    tabId: "host-editor-tab-attendance",
    panelIds: ["host-editor-panel-attendance"],
  },
  {
    key: "records",
    label: "공개 기록",
    tabId: "host-editor-tab-records",
    panelIds: [
      "host-editor-panel-publish",
      "host-editor-panel-records",
      "host-editor-panel-session-record-completion",
    ],
  },
  {
    key: "history",
    label: "변경 이력",
    tabId: "host-editor-tab-history",
    panelIds: ["host-editor-panel-history"],
  },
];

export function mobileEditorSectionConfig(section: MobileEditorSection) {
  return mobileEditorSections.find((item) => item.key === section) ?? mobileEditorSections[0];
}

function focusMobileEditorSection(section: MobileEditorSection) {
  globalThis.setTimeout(() => {
    document.getElementById(mobileEditorSectionConfig(section).tabId)?.focus();
  }, 0);
}

export function handleMobileEditorSectionKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  activeSection: MobileEditorSection,
  onSectionChange: (section: MobileEditorSection) => void,
) {
  const keys = mobileEditorSections.map((section) => section.key);
  const currentIndex = keys.indexOf(activeSection);
  const lastIndex = keys.length - 1;
  const nextIndex =
    event.key === "ArrowRight"
      ? (currentIndex + 1) % keys.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + keys.length) % keys.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? lastIndex
            : -1;

  if (nextIndex < 0) {
    return;
  }

  event.preventDefault();
  const nextSection = keys[nextIndex];
  onSectionChange(nextSection);
  focusMobileEditorSection(nextSection);
}
