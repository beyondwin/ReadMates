import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminActionDock, AdminSafeActionDock } from "./admin-action-dock";

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

describe("AdminSafeActionDock", () => {
  it.each(["denied", "stale", "unknown-outcome"] as const)(
    "does not trigger the primary callback when %s",
    async (mode) => {
      const onPrimary = vi.fn();
      const user = userEvent.setup();
      render(
        <AdminSafeActionDock
          level="L1"
          authority={mode === "denied" ? "denied" : "allowed"}
          state={mode === "denied" ? "ready" : mode}
          reason="지금은 실행할 수 없습니다"
          primary={
            <button type="button" onClick={onPrimary}>
              확인 처리
            </button>
          }
        />,
      );

      const dock = screen.getByRole("group", { name: "작업" });
      expect(dock).toHaveClass("admin-action-dock");
      await user.click(screen.getByRole("button", { name: "확인 처리" }));
      expect(onPrimary).not.toHaveBeenCalled();
      expect(screen.getByText("지금은 실행할 수 없습니다")).toBeInTheDocument();
    },
  );

  it("keeps a ready allowed primary clickable", async () => {
    const onPrimary = vi.fn();
    const user = userEvent.setup();
    render(
      <AdminSafeActionDock
        level="L1"
        authority="allowed"
        state="ready"
        primary={
          <button type="button" onClick={onPrimary}>
            확인 처리
          </button>
        }
      />,
    );

    await user.click(screen.getByRole("button", { name: "확인 처리" }));
    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it("does not activate a wrapped button or link primary when locked", () => {
    const onButton = vi.fn();
    const onLink = vi.fn();
    const { rerender } = render(
      <AdminSafeActionDock
        level="L1"
        authority="denied"
        state="ready"
        reason="지금은 실행할 수 없습니다"
        primary={
          <div>
            <button type="button" onClick={onButton}>
              확인 처리
            </button>
          </div>
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "확인 처리" }));
    expect(onButton).not.toHaveBeenCalled();

    rerender(
      <AdminSafeActionDock
        level="L1"
        authority="denied"
        state="stale"
        reason="지금은 실행할 수 없습니다"
        primary={
          <span>
            <a href="/admin/clubs" onClick={onLink}>
              클럽으로
            </a>
          </span>
        }
      />,
    );

    const link = screen.getByRole("link", { name: "클럽으로" });
    fireEvent.click(link);
    expect(onLink).not.toHaveBeenCalled();
    expect(link).not.toHaveAttribute("href");
    expect(link).toHaveAttribute("aria-disabled", "true");
  });
});
