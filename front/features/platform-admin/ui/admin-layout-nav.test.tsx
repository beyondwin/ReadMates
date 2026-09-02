import { render, screen, within } from "@testing-library/react";
import type { CSSProperties, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminRouteOwner } from "@/features/platform-admin/model/admin-route-catalog";
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
    "EMERGENCY_PUBLIC_TAKEDOWN",
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
  currentOwner?: AdminRouteOwner | null;
  compact?: boolean;
  todayCount?: number | null;
  onLogout?: () => void;
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
    <AdminLayoutNav
      capabilities={opts.capabilities === undefined ? ownerCapabilities : opts.capabilities}
      currentOwner={opts.currentOwner === undefined ? "today" : opts.currentOwner}
      renderLink={renderTestLink}
      todayCount={opts.todayCount}
      onLogout={opts.onLogout}
    />,
  );
}

function renderTestLink({
  href,
  className,
  ariaCurrent,
  style,
  children,
}: {
  href: string;
  className: string;
  ariaCurrent?: "page";
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className} aria-current={ariaCurrent} style={style}>
      {children}
    </a>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminLayoutNav", () => {
  it("renders exactly four Korean operating-job links without nested destinations", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "플랫폼 관리 메뉴" });
    expect(within(nav).getByRole("link", { name: "오늘 할 일" })).toHaveAttribute("href", "/admin/today");
    expect(within(nav).getByRole("link", { name: "클럽 관리" })).toHaveAttribute("href", "/admin/clubs");
    expect(within(nav).getByRole("link", { name: "서비스 상태" })).toHaveAttribute("href", "/admin/health");
    expect(within(nav).getByRole("link", { name: "처리 기록" })).toHaveAttribute("href", "/admin/audit");
    expect(within(nav).queryByText("서비스")).not.toBeInTheDocument();
    expect(within(nav).queryByText("검토")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Command")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Operations")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Review")).not.toBeInTheDocument();
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(screen.queryByRole("link", { name: "배달 원장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "AI 작업" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "접근 원장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "분석 부록" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "클럽 상세" })).not.toBeInTheDocument();
  });

  it("wires the rail account control to the supplied callback and stays decorative without one", async () => {
    const onLogout = vi.fn();
    const { unmount } = renderNav({ onLogout });
    const account = screen.getByRole("button", { name: "다른 계정으로 로그인" });
    expect(account.tagName).toBe("BUTTON");
    expect(screen.queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument();
    account.click();
    expect(onLogout).toHaveBeenCalledOnce();
    unmount();

    renderNav();
    expect(screen.queryByRole("button", { name: "다른 계정으로 로그인" })).not.toBeInTheDocument();
    expect(document.querySelector(".admin-layout-nav__logout")).toHaveAttribute("aria-hidden", "true");
  });

  it("pins emergency public takedown at the bottom of the nav", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "플랫폼 관리 메뉴" });
    const lists = nav.querySelectorAll(":scope > ul");
    expect(lists).toHaveLength(2);
    const pinned = lists[1];
    expect(pinned).toHaveClass("admin-layout-nav__pinned");
    expect(within(pinned as HTMLElement).getByRole("link", { name: "긴급 공개 회수" })).toHaveAttribute(
      "href",
      "/admin/public-takedown",
    );
    expect(within(nav).getByRole("link", { name: "서비스 상태" }).closest("li")?.textContent).not.toContain("긴급 공개 회수");
  });

  it("shows a mono attention count beside 오늘 when cases need attention", () => {
    renderNav({ todayCount: 7 });
    const today = screen.getByRole("link", { name: "오늘 할 일" });
    const count = today.querySelector(".admin-layout-nav__count");
    expect(count).toHaveTextContent("7");
    expect(count).toHaveClass("ledger-number");
    expect(screen.getByRole("link", { name: "클럽 관리" }).querySelector(".admin-layout-nav__count")).toBeNull();
  });

  it("hides the today count when attention is quiet", () => {
    renderNav({ todayCount: 0 });
    expect(screen.getByRole("link", { name: "오늘 할 일" }).querySelector(".admin-layout-nav__count")).toBeNull();
  });

  it("does not show 준비 중 pill on ready routes", () => {
    renderNav();
    expect(screen.getByRole("link", { name: "서비스 상태" }).textContent).not.toContain("준비 중");
    expect(screen.getByRole("link", { name: "오늘 할 일" }).textContent).not.toContain("준비 중");
    expect(screen.getByRole("link", { name: "처리 기록" }).textContent).not.toContain("준비 중");
  });

  it("marks the active route with aria-current=page", () => {
    renderNav({ currentOwner: "clubs" });
    expect(screen.getByRole("link", { name: "클럽 관리" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "오늘 할 일" })).not.toHaveAttribute("aria-current");
  });

  it("marks club detail as nested under 클럽 rather than a fifth primary item", () => {
    renderNav({ currentOwner: "clubs" });
    expect(screen.getByRole("link", { name: "클럽 관리" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "클럽 상세" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation").querySelectorAll(".admin-layout-nav__areas > li")).toHaveLength(4);
  });

  it("marks 서비스 상태 current for a nested health deep link", () => {
    renderNav({ currentOwner: "service" });
    expect(screen.getByRole("link", { name: "서비스 상태" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "오늘 할 일" })).not.toHaveAttribute("aria-current");
  });

  it("renders clubs and records current from the route-owned projection", () => {
    const { unmount } = renderNav({ currentOwner: "clubs" });
    expect(screen.getByRole("link", { name: "클럽 관리" })).toHaveAttribute("aria-current", "page");
    unmount();
    renderNav({ currentOwner: "records" });
    expect(screen.getByRole("link", { name: "처리 기록" })).toHaveAttribute("aria-current", "page");
  });

  it("renders the route-owned onboarding projection as 클럽 관리", () => {
    renderNav({ currentOwner: "clubs" });
    expect(screen.getByRole("link", { name: "클럽 관리" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "오늘 할 일" })).not.toHaveAttribute("aria-current");
  });

  it("marks pinned emergency current without activating a primary parent", () => {
    renderNav({ currentOwner: "emergency" });
    expect(screen.getByRole("link", { name: "긴급 공개 회수" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "서비스 상태" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "처리 기록" })).not.toHaveAttribute("aria-current");
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
  });

  it("hides items the capability projection does not allow", () => {
    renderNav({
      capabilities: projection(["VIEW_TODAY", "VIEW_SERVICE_HEALTH", "VIEW_AUDIT"]),
    });
    expect(screen.getByRole("link", { name: "오늘 할 일" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "서비스 상태" })).toHaveAttribute("href", "/admin/health");
    expect(screen.getByRole("link", { name: "처리 기록" })).toHaveAttribute("href", "/admin/audit");
    expect(screen.queryByRole("link", { name: "클럽 관리" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "긴급 공개 회수" })).not.toBeInTheDocument();
    expect(screen.queryByText("클럽")).not.toBeInTheDocument();
  });

  it("renders empty navigation when capabilities are missing or empty", () => {
    const { unmount } = renderNav({ capabilities: null });
    const emptyNav = screen.getByRole("navigation", { name: "플랫폼 관리 메뉴" });
    expect(within(emptyNav).queryAllByRole("link")).toEqual([]);
    expect(within(emptyNav).queryByText("오늘 할 일")).not.toBeInTheDocument();
    expect(within(emptyNav).queryByText("클럽 관리")).not.toBeInTheDocument();
    unmount();

    renderNav({ capabilities: projection([]) });
    const zeroNav = screen.getByRole("navigation", { name: "플랫폼 관리 메뉴" });
    expect(within(zeroNav).queryAllByRole("link")).toEqual([]);
    expect(within(zeroNav).queryByText("오늘 할 일")).not.toBeInTheDocument();
    expect(within(zeroNav).queryByText("처리 기록")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("link", { name: "클럽 관리" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "오늘 할 일" })).not.toBeInTheDocument();
  });

  it("uses the shared 768px media query for compact layout", () => {
    const { container } = renderNav({ compact: true });
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 768px)");
    expect(container.querySelector(".admin-layout-nav")).toBeNull();
  });
});
