import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findNestedLiveRegions, findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminPageContext } from "./admin-page-context";

const CSS_PATH = path.resolve("features/platform-admin/ui/admin-editorial-ledger.css");

describe("AdminPageContext", () => {
  it("composes AdminPageFrame with eyebrow, freshness, scope, and authority slots", () => {
    const { container } = render(
      <AdminPageContext
        eyebrow="오늘"
        heading="오늘의 운영 케이스"
        description="지금 손봐야 할 작업을 우선 확인합니다."
        freshness="19:00 기준"
        scope="전체 클럽"
        authority="보기 권한"
        action={<button type="button">필터 초기화</button>}
      >
        <p>작업 본문</p>
      </AdminPageContext>,
    );

    const page = screen.getByRole("region", { name: "오늘의 운영 케이스" });
    expect(page).toHaveClass("admin-page-frame");
    expect(screen.getByText("오늘")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "오늘의 운영 케이스" }).tagName).toBe("H1");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("지금 손봐야 할 작업을 우선 확인합니다.")).toBeInTheDocument();
    expect(screen.getByText("19:00 기준")).toBeInTheDocument();
    expect(screen.getByText("전체 클럽")).toBeInTheDocument();
    expect(screen.getByText("보기 권한")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "필터 초기화" })).toBeInTheDocument();
    expect(within(page).getByText("작업 본문")).toBeInTheDocument();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
    expect(findNestedLiveRegions(container)).toEqual([]);
  });

  it("keeps optional context slots quiet when omitted", () => {
    render(
      <AdminPageContext heading="검토">
        <p>검토 본문</p>
      </AdminPageContext>,
    );

    expect(screen.getByRole("region", { name: "검토" })).toBeInTheDocument();
    expect(screen.queryByText("19:00 기준")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("owns editorial ledger styles with paper, ink, stale tokens and 44px targets", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    expect(css).toContain("var(--paper");
    expect(css).toContain("var(--ink");
    expect(css).toContain("var(--accent");
    expect(css).toContain("var(--stale");
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(":focus-visible");
    expect(css).not.toMatch(/backdrop-filter|box-shadow:\s*0 0 \d+px|linear-gradient/);
  });
});
