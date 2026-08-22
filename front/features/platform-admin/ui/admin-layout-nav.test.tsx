import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import { AdminLayoutNav } from "./admin-layout-nav";

const ownerCapabilities: PlatformAdminCapabilities = {
  schemaVersion: 1,
  role: "OWNER",
  status: "ACTIVE",
  capabilities: [
    "VIEW_TODAY",
    "VIEW_CLUBS",
    "VIEW_CLUB_OPERATIONS",
    "VIEW_SERVICE_HEALTH",
    "VIEW_NOTIFICATION_OPERATIONS",
    "VIEW_AI_OPERATIONS",
    "VIEW_SUPPORT",
    "VIEW_AUDIT",
    "VIEW_ANALYTICS",
  ],
  generatedAt: "2026-08-22T00:00:00Z",
};

function projection(
  capabilities: PlatformAdminCapabilities["capabilities"],
): PlatformAdminCapabilities {
  return { ...ownerCapabilities, capabilities };
}

function renderNav(opts: {
  capabilities?: PlatformAdminCapabilities | null;
  activePath?: string;
  compact?: boolean;
} = {}) {
  if (opts.compact != null) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: opts.compact === true && query.includes("768px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  }
  return render(
    <MemoryRouter initialEntries={[opts.activePath ?? "/admin/today"]}>
      <AdminLayoutNav capabilities={opts.capabilities === undefined ? ownerCapabilities : opts.capabilities} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminLayoutNav", () => {
  it("renders four equal Korean primary areas without English group headers", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "플랫폼 관리 메뉴" });
    expect(within(nav).getByRole("link", { name: "오늘" })).toHaveAttribute("href", "/admin/today");
    expect(within(nav).getByRole("link", { name: "클럽" })).toHaveAttribute("href", "/admin/clubs");
    expect(within(nav).getByText("서비스")).toBeInTheDocument();
    expect(within(nav).getByText("검토")).toBeInTheDocument();
    expect(within(nav).queryByText("Command")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Operations")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Review")).not.toBeInTheDocument();
    expect(nav.querySelectorAll(":scope > ul").length).toBe(1);
    expect(nav.querySelectorAll("ul").length).toBe(3);
  });

  it("nests service and review destinations and keeps club detail out of the primary list", () => {
    renderNav();
    expect(screen.getByRole("link", { name: "서비스 건강" })).toHaveAttribute("href", "/admin/health");
    expect(screen.getByRole("link", { name: "알림" })).toHaveAttribute("href", "/admin/notifications");
    expect(screen.getByRole("link", { name: "AI 작업" })).toHaveAttribute("href", "/admin/ai-ops");
    expect(screen.getByRole("link", { name: "지원" })).toHaveAttribute("href", "/admin/support");
    expect(screen.getByRole("link", { name: "감사" })).toHaveAttribute("href", "/admin/audit");
    expect(screen.getByRole("link", { name: "분석" })).toHaveAttribute("href", "/admin/analytics");
    expect(screen.queryByRole("link", { name: "사건" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "클럽 상세" })).not.toBeInTheDocument();
  });

  it("does not show 준비 중 pill on ready routes", () => {
    renderNav();
    expect(screen.getByRole("link", { name: "알림" }).textContent).not.toContain("준비 중");
    expect(screen.getByRole("link", { name: "오늘" }).textContent).not.toContain("준비 중");
    expect(screen.getByRole("link", { name: "감사" }).textContent).not.toContain("준비 중");
  });

  it("marks the active route with aria-current=page", () => {
    renderNav({ activePath: "/admin/clubs" });
    expect(screen.getByRole("link", { name: "클럽" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "오늘" })).not.toHaveAttribute("aria-current");
  });

  it("marks club detail as nested under 클럽 rather than a fifth primary item", () => {
    renderNav({ activePath: "/admin/clubs/club-1" });
    expect(screen.getByRole("link", { name: "클럽" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "클럽 상세" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation").querySelectorAll(":scope > ul > li")).toHaveLength(4);
  });

  it("marks the 서비스 parent current when a nested child is active", () => {
    renderNav({ activePath: "/admin/health" });
    const parent = screen.getByText("서비스");
    expect(parent).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "서비스 건강" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "오늘" })).not.toHaveAttribute("aria-current");
  });

  it("marks the 검토 parent current when a nested child is active", () => {
    renderNav({ activePath: "/admin/analytics" });
    expect(screen.getByText("검토")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "분석" })).toHaveAttribute("aria-current", "page");
  });

  it("hides items the capability projection does not allow", () => {
    renderNav({
      capabilities: projection(["VIEW_TODAY", "VIEW_SERVICE_HEALTH", "VIEW_AUDIT"]),
    });
    expect(screen.getByRole("link", { name: "오늘" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "서비스 건강" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "감사" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "클럽" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "알림" })).not.toBeInTheDocument();
    expect(screen.queryByText("클럽")).not.toBeInTheDocument();
  });

  it("renders empty navigation when capabilities are missing or empty", () => {
    const { unmount } = renderNav({ capabilities: null });
    const emptyNav = screen.getByRole("navigation", { name: "플랫폼 관리 메뉴" });
    expect(within(emptyNav).queryAllByRole("link")).toEqual([]);
    expect(within(emptyNav).queryByText("오늘")).not.toBeInTheDocument();
    expect(within(emptyNav).queryByText("지원")).not.toBeInTheDocument();
    unmount();

    renderNav({ capabilities: projection([]) });
    const zeroNav = screen.getByRole("navigation", { name: "플랫폼 관리 메뉴" });
    expect(within(zeroNav).queryAllByRole("link")).toEqual([]);
    expect(within(zeroNav).queryByText("오늘")).not.toBeInTheDocument();
    expect(within(zeroNav).queryByText("검토")).not.toBeInTheDocument();
  });

  it("does not fail-open the catalog from a SUPPORT role after capability loss", () => {
    renderNav({
      capabilities: {
        schemaVersion: 1,
        role: "SUPPORT",
        status: "ACTIVE",
        capabilities: [],
        generatedAt: "2026-08-22T00:00:00Z",
      },
    });
    expect(screen.queryByRole("link", { name: "지원" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "오늘" })).not.toBeInTheDocument();
  });

  it("uses the shared 768px media query for compact layout", () => {
    const { container } = renderNav({ compact: true });
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 768px)");
    expect(container.querySelector(".admin-layout-nav")).toHaveAttribute("data-layout", "compact");
  });
});
