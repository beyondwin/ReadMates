import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, within } from "@testing-library/react";
import type { CSSProperties, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminRouteOwner } from "@/features/platform-admin/model/admin-route-catalog";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import { AdminMobileNavigation } from "./admin-mobile-navigation";

const designTokens = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../design/system/src/styles/tokens.css",
  ),
  "utf8",
);

const allCapabilities: PlatformAdminCapabilities = {
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
    "EMERGENCY_PUBLIC_TAKEDOWN",
  ],
  generatedAt: "2026-08-22T00:00:00Z",
};

function projection(
  capabilities: PlatformAdminCapabilities["capabilities"],
): PlatformAdminCapabilities {
  return { ...allCapabilities, capabilities };
}

function renderMobileNavigation(
  currentOwner: AdminRouteOwner | null,
  capabilities: PlatformAdminCapabilities = allCapabilities,
) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("768px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  return render(
    <AdminMobileNavigation
      capabilities={capabilities}
      currentOwner={currentOwner}
      renderLink={renderTestLink}
      ariaLabel="Admin 모바일 메뉴"
    />,
  );
}

function renderTestLink({
  href,
  className,
  ariaCurrent,
  ariaLabel,
  style,
  children,
}: {
  href: string;
  className: string;
  ariaCurrent?: "page";
  ariaLabel?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className} aria-current={ariaCurrent} aria-label={ariaLabel} style={style}>
      {children}
    </a>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminMobileNavigation", () => {
  it("renders four native-link tabs with 44px targets and wrapping-safe labels", () => {
    renderMobileNavigation("today");
    const nav = screen.getByRole("navigation", { name: "Admin 모바일 메뉴" });
    const links = within(nav).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
      "오늘",
      "클럽",
      "상태",
      "기록",
    ]);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "오늘 할 일",
      "클럽 관리",
      "서비스 상태",
      "처리 기록",
    ]);
    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link.tagName).toBe("A");
      expect(link).not.toHaveAttribute("role");
      expect(link).not.toHaveAttribute("tabindex");
      expect(link).toHaveStyle({
        minHeight: "44px",
        minWidth: "0",
        overflowWrap: "anywhere",
        whiteSpace: "normal",
      });
    }
    expect(nav.querySelector("ul")).toHaveStyle({
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      width: "100%",
    });
    expect(nav).toHaveStyle({
      position: "fixed",
      right: "0",
      bottom: "0",
      left: "0",
      maxWidth: "100vw",
      overflowX: "hidden",
    });
  });

  it("uses the defined design-system raised surface token", () => {
    const stylesheet = document.createElement("style");
    stylesheet.textContent = designTokens;
    document.head.append(stylesheet);
    try {
      renderMobileNavigation("today");
      expect(getComputedStyle(document.documentElement).getPropertyValue("--bg-raised").trim()).not.toBe("");
      expect(screen.getByRole("navigation", { name: "Admin 모바일 메뉴" })).toHaveStyle({
        background: "var(--bg-raised)",
      });
    } finally {
      stylesheet.remove();
    }
  });

  it.each([
    ["today", "오늘 할 일"],
    ["clubs", "클럽 관리"],
    ["service", "서비스 상태"],
    ["records", "처리 기록"],
  ] as const)("marks the route-owned %s projection as %s", (owner, label) => {
    renderMobileNavigation(owner);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
  });

  it("renders the club-owned onboarding state without duplicating the space or account controls", () => {
    renderMobileNavigation("clubs");
    const nav = screen.getByRole("navigation", { name: "Admin 모바일 메뉴" });
    expect(within(nav).getByRole("link", { name: "클럽 관리" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).queryByText("플랫폼 운영")).not.toBeInTheDocument();
    expect(within(nav).queryByText("계정")).not.toBeInTheDocument();
  });

  it("keeps nested-only capabilities as existing axes and leaves emergency outside the tab bar", () => {
    renderMobileNavigation(
      "emergency",
      projection(["VIEW_SUPPORT", "VIEW_ANALYTICS", "EMERGENCY_PUBLIC_TAKEDOWN"]),
    );
    const nav = screen.getByRole("navigation", { name: "Admin 모바일 메뉴" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "클럽",
      "기록",
    ]);
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual([
      "클럽 관리",
      "처리 기록",
    ]);
    expect(within(nav).getByRole("link", { name: "클럽 관리" })).toHaveAttribute(
      "href",
      "/admin/support",
    );
    expect(within(nav).getByRole("link", { name: "처리 기록" })).toHaveAttribute(
      "href",
      "/admin/analytics",
    );
    expect(within(nav).queryByText("긴급 공개 회수")).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });

  it("does not render the mobile tab bar at the desktop breakpoint", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(
      <AdminMobileNavigation
        capabilities={allCapabilities}
        currentOwner="today"
        renderLink={renderTestLink}
      />,
    );
    expect(screen.queryByRole("navigation", { name: "플랫폼 관리 모바일 메뉴" })).not.toBeInTheDocument();
  });
});
