import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { findNestedLiveRegions, findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminTodayControls } from "./admin-today-controls";

const CSS_PATH = path.resolve("features/platform-admin/ui/admin-editorial-ledger.css");

const workViews = [
  { id: "briefing", label: "오늘의 브리핑", count: 8 },
  { id: "mine", label: "내 담당", count: 2 },
  { id: "snoozed", label: "보류", count: 1 },
  { id: "resolved-today", label: "오늘 해결", count: null },
] as const;

describe("AdminTodayControls", () => {
  it("collapses filters and signal status by default", () => {
    render(
      <AdminTodayControls
        workViews={workViews}
        activeView="briefing"
        query=""
        filters={{ state: "", severity: "", source: "", assignee: "" }}
        onViewChange={vi.fn()}
        onQueryChange={vi.fn()}
        onFilterChange={vi.fn()}
      />,
    );

    const secondary = screen.getByText("필터와 신호 상태").closest("details")!;
    expect(secondary).not.toHaveAttribute("open");
    expect(within(secondary).getByRole("combobox", { name: "상태 필터", hidden: true })).not.toBeVisible();
  });

  it("starts open when defaultOpen is set and stays collapsed across rerenders", async () => {
    const user = userEvent.setup();
    const props = {
      workViews,
      activeView: "briefing",
      query: "",
      filters: { state: "open" as const, severity: "", source: "", assignee: "" },
      onViewChange: vi.fn(),
      onQueryChange: vi.fn(),
      onFilterChange: vi.fn(),
    };

    const { rerender } = render(<AdminTodayControls defaultOpen {...props} />);
    const secondary = screen.getByText("필터와 신호 상태").closest("details")!;
    expect(secondary).toHaveAttribute("open");
    expect(within(secondary).getByRole("combobox", { name: "상태 필터" })).toBeVisible();

    await user.click(screen.getByText("필터와 신호 상태"));
    expect(secondary).not.toHaveAttribute("open");

    rerender(<AdminTodayControls defaultOpen pendingCount={1} {...props} />);
    expect(screen.getByText("필터와 신호 상태").closest("details")).not.toHaveAttribute("open");

    rerender(<AdminTodayControls defaultOpen={false} {...props} />);
    rerender(<AdminTodayControls defaultOpen {...props} />);
    expect(screen.getByText("필터와 신호 상태").closest("details")).not.toHaveAttribute("open");
  });

  it("reports work view, loaded-only search, and filters through callbacks only", async () => {
    const onViewChange = vi.fn();
    const onQueryChange = vi.fn();
    const onFilterChange = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <AdminTodayControls
        workViews={workViews}
        activeView="briefing"
        query=""
        filters={{ state: "", severity: "", source: "", assignee: "" }}
        onViewChange={onViewChange}
        onQueryChange={onQueryChange}
        onFilterChange={onFilterChange}
      />,
    );

    await user.click(screen.getByText("필터와 신호 상태"));

    await user.click(screen.getByRole("button", { name: "내 담당 2" }));
    expect(onViewChange).toHaveBeenCalledWith("mine");

    await user.type(screen.getByRole("searchbox", { name: "이미 불러온 케이스 검색" }), "알림");
    expect(onQueryChange).toHaveBeenCalled();

    await user.selectOptions(screen.getByRole("combobox", { name: "상태 필터" }), "open");
    expect(onFilterChange).toHaveBeenCalledWith("state", "open");
    expect(screen.getByRole("combobox", { name: "관측 출처 필터" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "모든 출처" })).toBeInTheDocument();

    expect(findUnnamedInteractiveElements(container)).toEqual([]);
    expect(findNestedLiveRegions(container)).toEqual([]);
  });

  it("reports pending and urgent counts without moving focus or nesting live regions", async () => {
    const onApplyPending = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <button type="button">현재 행</button>
        <AdminTodayControls
          workViews={workViews}
          activeView="briefing"
          query=""
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          pendingCount={3}
          urgentCount={1}
          onViewChange={vi.fn()}
          onQueryChange={vi.fn()}
          onFilterChange={vi.fn()}
          onApplyPending={onApplyPending}
        />
      </div>,
    );

    const current = screen.getByRole("button", { name: "현재 행" });
    current.focus();
    expect(current).toHaveFocus();
    expect(screen.getByRole("button", { name: "새 항목 3개 적용", hidden: true })).not.toHaveFocus();
    expect(screen.getByText("긴급 1건")).toBeInTheDocument();
    expect(findNestedLiveRegions(container)).toEqual([]);

    await user.click(screen.getByText("필터와 신호 상태"));
    await user.click(screen.getByRole("button", { name: "새 항목 3개 적용" }));
    expect(onApplyPending).toHaveBeenCalledOnce();
  });

  it("pins Today control targets to 44px in the scoped editorial stylesheet", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    expect(css).toMatch(/\.admin-today-controls[\s\S]*min-height:\s*44px/);
    expect(css).toMatch(/\.admin-today-controls[\s\S]*:focus-visible/);
    expect(css).toContain("prefers-reduced-motion");
  });
});
