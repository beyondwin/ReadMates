import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminActionDock } from "./admin-action-dock";

const GLOBALS_CSS = readFileSync("src/styles/globals.css", "utf8");

describe("AdminActionDock", () => {
  it("renders primary, secondary, and status slots", () => {
    render(
      <AdminActionDock
        primary={<button type="button">신호 재검증 후 해결</button>}
        secondary={<button type="button">닫기</button>}
        status={<p>상태를 반영하고 있습니다.</p>}
      />,
    );

    const dock = screen.getByRole("group", { name: "작업" });
    expect(dock).toHaveClass("admin-action-dock");
    expect(screen.getByRole("button", { name: "신호 재검증 후 해결" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "닫기" })).toBeInTheDocument();
    expect(screen.getByText("상태를 반영하고 있습니다.")).toBeInTheDocument();
  });

  it("omits unused slots so an empty dock does not invent actions", () => {
    render(<AdminActionDock status={<p>읽기 전용입니다.</p>} />);

    expect(screen.getByText("읽기 전용입니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.querySelector(".admin-action-dock__primary")).toBeNull();
    expect(document.querySelector(".admin-action-dock__secondary")).toBeNull();
  });

  it("pins the mobile dock to the 768px contract with a bottom safe area and 44px targets", () => {
    const dockBlock = GLOBALS_CSS.slice(GLOBALS_CSS.indexOf(".admin-action-dock"));
    expect(dockBlock).toContain("@media (max-width: 768px)");
    expect(dockBlock).toContain("env(safe-area-inset-bottom");
    expect(dockBlock).toMatch(/min-height:\s*44px/);
    expect(dockBlock).toContain("prefers-reduced-motion: reduce");
  });
});
