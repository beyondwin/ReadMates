import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminLayoutNav } from "./admin-layout-nav";

function renderNav(opts: { role?: "OWNER" | "OPERATOR" | "SUPPORT"; activePath?: string }) {
  return render(
    <MemoryRouter initialEntries={[opts.activePath ?? "/admin/today"]}>
      <AdminLayoutNav role={opts.role ?? "OWNER"} />
    </MemoryRouter>,
  );
}

describe("AdminLayoutNav", () => {
  it("renders the 3 group headers", () => {
    renderNav({});
    expect(screen.getByText("오늘/헬스")).toBeInTheDocument();
    expect(screen.getByText("운영")).toBeInTheDocument();
    expect(screen.getByText("감사/분석")).toBeInTheDocument();
  });

  it("renders all 8 nav items", () => {
    renderNav({});
    for (const label of ["오늘", "헬스", "클럽", "지원", "알림", "AI Ops", "감사", "분석"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("does not show 준비 중 pill on the notifications item", () => {
    renderNav({});
    const notificationsLink = screen.getByRole("link", { name: /알림/ });
    expect(notificationsLink.textContent).not.toContain("준비 중");
  });

  it("does not show 준비 중 pill on ready routes", () => {
    renderNav({});
    const todayLink = screen.getByRole("link", { name: /오늘/ });
    expect(todayLink.textContent).not.toContain("준비 중");
  });

  it("marks the active route with aria-current=page", () => {
    renderNav({ activePath: "/admin/clubs" });
    const clubsLink = screen.getByRole("link", { name: /클럽/ });
    expect(clubsLink).toHaveAttribute("aria-current", "page");
  });
});
