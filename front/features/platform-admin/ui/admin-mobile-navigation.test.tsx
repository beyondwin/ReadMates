import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import { AdminMobileNavigation } from "./admin-mobile-navigation";

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
  initialEntry: string,
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
    <MemoryRouter initialEntries={[initialEntry]}>
      <AdminMobileNavigation
        capabilities={capabilities}
        ariaLabel="Admin 모바일 메뉴"
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminMobileNavigation", () => {
  it("renders four native-link tabs with 44px targets and wrapping-safe labels", () => {
    renderMobileNavigation("/admin/today");
    const nav = screen.getByRole("navigation", { name: "Admin 모바일 메뉴" });
    const links = within(nav).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
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

  it.each([
    ["/admin/today", "오늘 할 일"],
    ["/admin/clubs/club-1", "클럽 관리"],
    ["/admin/support?clubId=club-1", "클럽 관리"],
    ["/admin/notifications?focus=failed", "서비스 상태"],
    ["/admin/ai-ops?window=30d", "서비스 상태"],
    ["/admin/analytics?window=30d", "처리 기록"],
  ])("marks %s through the shared route owner as %s", (entry, label) => {
    renderMobileNavigation(entry);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  });

  it("maps onboarding to club management without duplicating the space or account controls", () => {
    renderMobileNavigation("/admin/today?onboarding=1");
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
      "/admin/public-takedown",
      projection(["VIEW_SUPPORT", "VIEW_ANALYTICS", "EMERGENCY_PUBLIC_TAKEDOWN"]),
    );
    const nav = screen.getByRole("navigation", { name: "Admin 모바일 메뉴" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
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
      <MemoryRouter initialEntries={["/admin/today"]}>
        <AdminMobileNavigation capabilities={allCapabilities} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("navigation", { name: "플랫폼 관리 모바일 메뉴" })).not.toBeInTheDocument();
  });
});
