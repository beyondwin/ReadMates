import { describe, expect, it } from "vitest";
import {
  ADMIN_CLUB_DETAIL_ROUTE,
  ADMIN_ROUTES,
  type AdminRouteDescriptor,
} from "./admin-route-catalog";

describe("ADMIN_ROUTES catalog", () => {
  it("contains exactly the 8 nav-visible routes", () => {
    const paths = ADMIN_ROUTES.map((route) => route.path).sort();
    expect(paths).toEqual([
      "ai-ops",
      "analytics",
      "audit",
      "clubs",
      "health",
      "notifications",
      "support",
      "today",
    ]);
  });

  it("has no duplicate paths", () => {
    const paths = ADMIN_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("uses a single label per group", () => {
    const labelByGroup = new Map<string, string>();
    for (const route of ADMIN_ROUTES) {
      const existing = labelByGroup.get(route.group);
      if (existing) expect(existing).toBe(route.groupLabel);
      else labelByGroup.set(route.group, route.groupLabel);
    }
  });

  it("requires comingSoon block when status is coming_soon", () => {
    for (const route of ADMIN_ROUTES) {
      if (route.status === "coming_soon") {
        expect(route.comingSoon).toBeDefined();
        expect(route.comingSoon?.title).toBeTruthy();
        expect(route.comingSoon?.summary).toBeTruthy();
        expect(route.comingSoon?.bullets.length).toBeGreaterThanOrEqual(3);
        expect(route.comingSoon?.docHref).toMatch(
          /^\/docs\/superpowers\/specs\/2026-05-25-readmates-admin-vnext-roadmap-design\.md#/,
        );
      } else {
        expect(route.comingSoon).toBeUndefined();
      }
    }
  });

  it("requires no comingSoon block when status is ready", () => {
    const ready = ADMIN_ROUTES.filter((route) => route.status === "ready");
    expect(ready.map((route) => route.path).sort()).toEqual([
      "ai-ops",
      "audit",
      "clubs",
      "health",
      "notifications",
      "support",
      "today",
    ]);
  });

  it("ADMIN_CLUB_DETAIL_ROUTE is not in the nav catalog", () => {
    const navPaths = new Set(ADMIN_ROUTES.map((route) => route.path));
    expect(navPaths.has(ADMIN_CLUB_DETAIL_ROUTE.path)).toBe(false);
    expect(ADMIN_CLUB_DETAIL_ROUTE.path).toBe("clubs/:clubId");
    expect(ADMIN_CLUB_DETAIL_ROUTE.status).toBe("ready");
  });

  it("every descriptor has a valid required capability", () => {
    const valid = new Set([
      "view_today", "view_clubs", "view_club_detail",
      "view_ai_ops", "view_support", "view_health",
      "view_notifications", "view_audit", "view_analytics",
    ]);
    const all: AdminRouteDescriptor[] = [...ADMIN_ROUTES, ADMIN_CLUB_DETAIL_ROUTE];
    for (const route of all) {
      expect(valid.has(route.requiredCapability)).toBe(true);
    }
  });
});
