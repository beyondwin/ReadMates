import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { findNestedLiveRegions, findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminWorkViewBar } from "./admin-work-view-bar";

const views = [
  { id: "briefing", label: "오늘의 브리핑", count: 8 },
  { id: "mine", label: "내 담당", count: 2 },
] as const;

describe("AdminWorkViewBar", () => {
  it("reports view changes, search, and filters through callbacks only", async () => {
    const onViewChange = vi.fn();
    const onSearchChange = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <AdminWorkViewBar
        views={views}
        activeView="briefing"
        onViewChange={onViewChange}
        search={{
          label: "이미 불러온 사건 검색",
          value: "",
          placeholder: "사건 번호",
          onChange: onSearchChange,
        }}
        filters={<label>상태 <select aria-label="상태"><option>전체</option></select></label>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "내 담당 2" }));
    expect(onViewChange).toHaveBeenCalledWith("mine");

    await user.type(screen.getByRole("searchbox", { name: "이미 불러온 사건 검색" }), "case-1");
    expect(onSearchChange).toHaveBeenCalled();
    expect(screen.getByLabelText("상태")).toBeInTheDocument();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
    expect(findNestedLiveRegions(container)).toEqual([]);
  });

  it("reports pending and urgent counts without moving focus", () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <div>
        <button type="button">현재 행</button>
        <AdminWorkViewBar views={views} activeView="briefing" />
      </div>,
    );

    const current = screen.getByRole("button", { name: "현재 행" });
    current.focus();
    expect(current).toHaveFocus();

    rerender(
      <div>
        <button type="button">현재 행</button>
        <AdminWorkViewBar
          views={views}
          activeView="briefing"
          pending={{ count: 3, urgentCount: 1, onApply }}
        />
      </div>,
    );

    expect(current).toHaveFocus();
    expect(screen.getByRole("button", { name: "새 항목 3개 적용" })).not.toHaveFocus();
    expect(screen.getByText("긴급 1건")).toBeInTheDocument();
    expect(findNestedLiveRegions(document.body)).toEqual([]);
  });

  it("applies pending items only when the operator chooses the CTA", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <AdminWorkViewBar pending={{ count: 3, urgentCount: 1, onApply }} />,
    );

    await user.click(screen.getByRole("button", { name: "새 항목 3개 적용" }));
    expect(onApply).toHaveBeenCalledOnce();
  });
});
