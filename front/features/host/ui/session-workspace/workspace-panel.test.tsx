import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspacePanel } from "./workspace-panel";

function PanelHarness({
  initialExpanded = false,
  variant = "inline" as const,
}: {
  initialExpanded?: boolean;
  variant?: "inline" | "sheet";
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  return (
    <>
      <button type="button" onClick={() => setExpanded(true)}>
        모임 정보
      </button>
      <WorkspacePanel
        id="workspace-panel-basic"
        title="모임 정보"
        eyebrow="기본 정보"
        expanded={expanded}
        variant={variant}
        onToggle={() => setExpanded((current) => !current)}
      >
        <label>
          모임 제목
          <input defaultValue="테스트 책" />
        </label>
      </WorkspacePanel>
    </>
  );
}

describe("WorkspacePanel", () => {
  it("opens from the originating control and restores it on Escape", async () => {
    const user = userEvent.setup();
    render(<PanelHarness />);

    const trigger = screen.getByRole("button", { name: "모임 정보" });
    await user.click(trigger);

    expect(screen.getByLabelText("모임 제목")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("모임 제목")).not.toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("traps focus inside a sheet and restores the originating control on Escape", async () => {
    const user = userEvent.setup();
    render(<PanelHarness variant="sheet" />);

    const trigger = screen.getByRole("button", { name: "모임 정보" });
    await user.click(trigger);

    const sheet = screen.getByRole("dialog", { name: "모임 정보" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(sheet).toContainElement(document.activeElement as HTMLElement);

    await user.tab();
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    await user.tab();
    expect(sheet).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "모임 정보" })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("does not steal Escape from a nested modal dialog", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <WorkspacePanel
        id="workspace-panel-history"
        title="변경 내역"
        expanded
        variant="sheet"
        onToggle={onToggle}
      >
        <div role="dialog" aria-modal="true" aria-label="이 변경을 되돌릴까요?">
          <button type="button">취소</button>
        </div>
      </WorkspacePanel>,
    );

    screen.getByRole("button", { name: "취소" }).focus();
    await user.keyboard("{Escape}");
    expect(onToggle).not.toHaveBeenCalled();
  });
});
