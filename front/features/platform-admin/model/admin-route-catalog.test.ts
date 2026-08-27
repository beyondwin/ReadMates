import { describe, expect, it } from "vitest";
import {
  ADMIN_CLUB_DETAIL_ROUTE,
  ADMIN_ROUTES,
  ADMIN_SHELL_LAYOUT_BREAKPOINT_PX,
  ADMIN_SHELL_LAYOUT_MEDIA_QUERY,
  type AdminRouteDescriptor,
  visibleAdminNav,
} from "./admin-route-catalog";
import type { PlatformAdminCapabilities } from "./platform-admin-capabilities";

function projection(
  capabilities: PlatformAdminCapabilities["capabilities"],
): PlatformAdminCapabilities {
  return {
    schemaVersion: 1,
    role: "OWNER",
    status: "ACTIVE",
    capabilities,
    generatedAt: "2026-08-22T00:00:00Z",
  };
}

describe("ADMIN_ROUTES catalog", () => {
  it("contains exactly the 9 nav-visible routes", () => {
    const paths = ADMIN_ROUTES.map((route) => route.path).sort();
    expect(paths).toEqual([
      "ai-ops",
      "analytics",
      "audit",
      "clubs",
      "health",
      "notifications",
      "public-takedown",
      "support",
      "today",
    ]);
  });

  it("has no duplicate paths", () => {
    const paths = ADMIN_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("uses a single Korean label per primary area", () => {
    const labelByGroup = new Map<string, string>();
    for (const route of ADMIN_ROUTES) {
      if (route.group == null) continue;
      const existing = labelByGroup.get(route.group);
      if (existing) expect(existing).toBe(route.groupLabel);
      else labelByGroup.set(route.group, route.groupLabel);
    }
    expect([...labelByGroup.entries()]).toEqual([
      ["today", "오늘"],
      ["clubs", "클럽"],
      ["pipeline", "파이프라인"],
      ["ledger", "원장"],
    ]);
  });

  it("groups the operating ledger into four Korean primary areas", () => {
    expect(
      ADMIN_ROUTES.map(({ path, label, group, groupLabel, requiredCapability }) => ({
        path,
        label,
        group,
        groupLabel,
        requiredCapability,
      })),
    ).toEqual([
      {
        path: "today",
        label: "오늘",
        group: "today",
        groupLabel: "오늘",
        requiredCapability: "VIEW_TODAY",
      },
      {
        path: "clubs",
        label: "클럽",
        group: "clubs",
        groupLabel: "클럽",
        requiredCapability: "VIEW_CLUBS",
      },
      {
        path: "notifications",
        label: "배달 원장",
        group: "pipeline",
        groupLabel: "파이프라인",
        requiredCapability: "VIEW_NOTIFICATION_OPERATIONS",
      },
      {
        path: "ai-ops",
        label: "AI 작업",
        group: "pipeline",
        groupLabel: "파이프라인",
        requiredCapability: "VIEW_AI_OPERATIONS",
      },
      {
        path: "health",
        label: "서비스 건강",
        group: "pipeline",
        groupLabel: "파이프라인",
        requiredCapability: "VIEW_SERVICE_HEALTH",
      },
      {
        path: "audit",
        label: "운영 기입",
        group: "ledger",
        groupLabel: "원장",
        requiredCapability: "VIEW_AUDIT",
      },
      {
        path: "support",
        label: "접근 원장",
        group: "ledger",
        groupLabel: "원장",
        requiredCapability: "VIEW_SUPPORT",
      },
      {
        path: "analytics",
        label: "분석 부록",
        group: "ledger",
        groupLabel: "원장",
        requiredCapability: "VIEW_ANALYTICS",
      },
      {
        path: "public-takedown",
        label: "긴급 공개 회수",
        group: null,
        groupLabel: "비상 레인",
        requiredCapability: "EMERGENCY_PUBLIC_TAKEDOWN",
      },
    ]);
  });

  it("does not expose English Command/Operations/Review group headers", () => {
    for (const route of ADMIN_ROUTES) {
      expect(route.groupLabel).not.toMatch(/Command|Operations|Review/);
      expect(route.label).not.toBe("사건");
    }
  });

  it("keeps CSS and React layout breakpoints on the same 768px contract", () => {
    expect(ADMIN_SHELL_LAYOUT_BREAKPOINT_PX).toBe(768);
    expect(ADMIN_SHELL_LAYOUT_MEDIA_QUERY).toBe("(max-width: 768px)");
  });

  it("requires comingSoon block when status is coming_soon", () => {
    for (const route of ADMIN_ROUTES) {
      if (route.status === "coming_soon") {
        expect(route.comingSoon).toBeDefined();
        expect(route.comingSoon?.title).toBeTruthy();
        expect(route.comingSoon?.summary).toBeTruthy();
        expect(route.comingSoon?.bullets.length).toBeGreaterThanOrEqual(3);
        expect(route.comingSoon?.docHref).toMatch(
          /^\/docs\/superpowers\/specs\/2026-05-25-readmates-admin-vnext-roadmap-design.md#/,
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
      "analytics",
      "audit",
      "clubs",
      "health",
      "notifications",
      "public-takedown",
      "support",
      "today",
    ]);
  });

  it("ADMIN_CLUB_DETAIL_ROUTE is nested under clubs and is not a fifth primary tab", () => {
    const navPaths = new Set(ADMIN_ROUTES.map((route) => route.path));
    expect(navPaths.has(ADMIN_CLUB_DETAIL_ROUTE.path)).toBe(false);
    expect(ADMIN_CLUB_DETAIL_ROUTE).toMatchObject({
      path: "clubs/:clubId",
      label: "클럽 상세",
      group: "clubs",
      groupLabel: "클럽",
      status: "ready",
      requiredCapability: "VIEW_CLUB_OPERATIONS",
    });
    expect(
      visibleAdminNav(projection(["VIEW_CLUBS", "VIEW_CLUB_OPERATIONS"])).areas.map((area) => area.id),
    ).toEqual(["clubs"]);
  });

  it("every descriptor has a server enum required capability", () => {
    const valid = new Set([
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
    ]);
    const all: AdminRouteDescriptor[] = [...ADMIN_ROUTES, ADMIN_CLUB_DETAIL_ROUTE];
    for (const route of all) {
      expect(valid.has(route.requiredCapability)).toBe(true);
    }
  });
});

describe("visibleAdminNav", () => {
  it("places today and clubs as direct destinations and nests pipeline and ledger children", () => {
    const nav = visibleAdminNav(
      projection([
        "VIEW_TODAY",
        "VIEW_CLUBS",
        "VIEW_SERVICE_HEALTH",
        "VIEW_NOTIFICATION_OPERATIONS",
        "VIEW_AI_OPERATIONS",
        "EMERGENCY_PUBLIC_TAKEDOWN",
        "VIEW_SUPPORT",
        "VIEW_AUDIT",
        "VIEW_ANALYTICS",
      ]),
    );

    expect(nav.areas.map((area) => ({ id: area.id, label: area.label, href: area.href }))).toEqual([
      { id: "today", label: "오늘", href: "/admin/today" },
      { id: "clubs", label: "클럽", href: "/admin/clubs" },
      { id: "pipeline", label: "파이프라인", href: undefined },
      { id: "ledger", label: "원장", href: undefined },
    ]);
    expect(nav.areas.find((area) => area.id === "pipeline")?.children.map((route) => route.path)).toEqual([
      "notifications",
      "ai-ops",
      "health",
    ]);
    expect(nav.areas.find((area) => area.id === "ledger")?.children.map((route) => route.path)).toEqual([
      "audit",
      "support",
      "analytics",
    ]);
    expect(nav.areas.flatMap((area) => area.children.map((route) => route.path))).not.toContain(
      "clubs/:clubId",
    );
    expect(nav.areas.flatMap((area) => area.children.map((route) => route.path))).not.toContain(
      "public-takedown",
    );
  });

  it("pins emergency public takedown outside primary groups", () => {
    const nav = visibleAdminNav(
      projection(["VIEW_TODAY", "EMERGENCY_PUBLIC_TAKEDOWN", "VIEW_AUDIT"]),
    );
    expect(nav.pinned.map((route) => ({ path: route.path, label: route.label, group: route.group }))).toEqual([
      { path: "public-takedown", label: "긴급 공개 회수", group: null },
    ]);
    expect(nav.areas.map((area) => area.id)).toEqual(["today", "ledger"]);
  });

  it("hides routes, empty parents, and pinned emergency when the projection omits their capability", () => {
    const nav = visibleAdminNav(projection(["VIEW_TODAY", "VIEW_SERVICE_HEALTH", "VIEW_AUDIT"]));
    expect(nav.areas.map((area) => area.id)).toEqual(["today", "pipeline", "ledger"]);
    expect(nav.areas.find((area) => area.id === "pipeline")?.children.map((route) => route.path)).toEqual([
      "health",
    ]);
    expect(nav.areas.find((area) => area.id === "ledger")?.children.map((route) => route.path)).toEqual([
      "audit",
    ]);
    expect(nav.pinned).toEqual([]);
  });

  it("returns empty navigation when capabilities are missing or empty", () => {
    expect(visibleAdminNav(null)).toEqual({ areas: [], pinned: [] });
    expect(visibleAdminNav(undefined)).toEqual({ areas: [], pinned: [] });
    expect(visibleAdminNav(projection([]))).toEqual({ areas: [], pinned: [] });
  });
});
