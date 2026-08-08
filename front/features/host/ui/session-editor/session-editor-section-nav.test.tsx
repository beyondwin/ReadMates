import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostSessionEditorSection } from "../../model/host-session-editor-navigation";
import { Panel } from "./session-editor-panel";
import { SessionEditorSectionNav } from "./session-editor-section-nav";

describe("SessionEditorSectionNav", () => {
  it("renders five equal mobile tabs with responsive labels", () => {
    const { container } = render(
      <SessionEditorSectionNav activeSection="overview" onSectionChange={() => {}} />,
    );

    const tablist = screen.getByRole("tablist", { name: "호스트 편집 섹션" });
    const tabs = within(tablist).getAllByRole("tab");

    expect(tabs).toHaveLength(5);
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "개요",
      "기본 정보",
      "출석",
      "기록 작업대",
      "변경 기록",
    ]);
    expect(Array.from(container.querySelectorAll("[data-desktop-label]"), (label) => label.textContent))
      .toEqual(["개요", "기본 정보", "출석", "기록 작업대", "변경 기록"]);
    expect(Array.from(container.querySelectorAll("[data-mobile-label]"), (label) => label.textContent))
      .toEqual(["개요", "기본", "출석", "기록", "변경"]);
    expect(tablist).toHaveClass("rm-host-session-editor__section-nav");
    tabs.forEach((tab) => {
      expect(tab).toHaveClass("rm-host-session-editor__section-tab");
      expect(tab).not.toHaveAttribute("style");
    });
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    tabs.slice(1).forEach((tab) => {
      expect(tab).toHaveAttribute("aria-selected", "false");
      expect(tab).toHaveAttribute("tabindex", "-1");
    });
  });

  it("reports the section selected by click", async () => {
    const user = userEvent.setup();
    const onSectionChange = vi.fn();
    render(
      <SessionEditorSectionNav activeSection="overview" onSectionChange={onSectionChange} />,
    );

    await user.click(screen.getByRole("tab", { name: "기록 작업대" }));

    expect(onSectionChange).toHaveBeenCalledWith("records");
  });

  it("wraps arrow navigation and supports Home and End with roving focus", async () => {
    const user = userEvent.setup();
    render(<StatefulNav />);

    const overview = screen.getByRole("tab", { name: "개요" });
    const basic = screen.getByRole("tab", { name: "기본 정보" });
    const history = screen.getByRole("tab", { name: "변경 기록" });

    overview.focus();
    await user.keyboard("{ArrowLeft}");
    expect(history).toHaveFocus();
    expect(history).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}");
    expect(overview).toHaveFocus();
    expect(overview).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}");
    expect(basic).toHaveFocus();
    expect(basic).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    expect(history).toHaveFocus();
    expect(history).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(overview).toHaveFocus();
    expect(overview).toHaveAttribute("aria-selected", "true");
  });
});

describe("Panel", () => {
  it("keeps only the active section visible and in the accessibility tree", () => {
    render(
      <>
        <Panel
          eyebrow="개요"
          title="세션 개요"
          section="overview"
          panelId="host-editor-panel-overview"
          activeSection="overview"
        >
          현재 패널 내용
        </Panel>
        <Panel
          eyebrow="기록"
          title="기록 작업대"
          section="records"
          panelId="host-editor-panel-records"
          activeSection="overview"
        >
          비공개 패널 내용
        </Panel>
      </>,
    );

    const activePanel = screen.getByRole("tabpanel");
    expect(activePanel).toHaveAttribute("id", "host-editor-panel-overview");
    expect(activePanel).not.toHaveAttribute("hidden");
    expect(activePanel).toHaveClass("is-active");
    const inactivePanel = screen.getAllByRole("tabpanel", { hidden: true })[1];
    expect(inactivePanel).toHaveAttribute("hidden");
    expect(inactivePanel).toHaveClass("is-inactive");
    expect(inactivePanel).toHaveAttribute("aria-labelledby", "host-editor-tab-records");
  });
});

function StatefulNav() {
  const [activeSection, setActiveSection] = useState<HostSessionEditorSection>("overview");

  return (
    <SessionEditorSectionNav
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    />
  );
}
