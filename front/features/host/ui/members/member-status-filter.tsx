import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { MemberTab } from "./types";

const tabs: Array<{ key: MemberTab; label: string }> = [
  { key: "active", label: "활성 멤버" },
  { key: "viewer", label: "둘러보기 멤버" },
  { key: "suspended", label: "정지됨" },
  { key: "inactive", label: "탈퇴/비활성" },
  { key: "invitations", label: "초대" },
];

export function MemberStatusFilter({
  activeTab,
  onTabChange,
}: {
  activeTab: MemberTab;
  onTabChange: (tab: MemberTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="멤버 관리"
      className="surface"
      onKeyDown={(event) => handleMemberTabKeyDown(event, activeTab, onTabChange)}
      style={{ padding: 6, display: "flex", flexWrap: "wrap", gap: 6 }}
    >
      {tabs.map((tab) => {
        const selected = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`host-members-panel-${tab.key}`}
            id={`host-members-tab-${tab.key}`}
            className={`btn btn-sm ${selected ? "btn-primary" : "btn-quiet"}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function focusMemberTab(tab: MemberTab) {
  globalThis.setTimeout(() => {
    document.getElementById(`host-members-tab-${tab}`)?.focus();
  }, 0);
}

function handleMemberTabKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  activeTab: MemberTab,
  onTabChange: (tab: MemberTab) => void,
) {
  const keys = tabs.map((tab) => tab.key);
  const currentIndex = keys.indexOf(activeTab);
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
  const nextTab = keys[nextIndex];
  onTabChange(nextTab);
  focusMemberTab(nextTab);
}
