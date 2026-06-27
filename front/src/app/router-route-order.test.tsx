import { QueryClient } from "@tanstack/react-query";
import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { buildRoutes } from "@/src/app/router";

function routeIdsFor(pathname: string): Array<string | undefined> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (matchRoutes(buildRoutes(queryClient), pathname) ?? []).map((match) => match.route.id);
}

function routePathsFor(pathname: string): Array<string | undefined> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (matchRoutes(buildRoutes(queryClient), pathname) ?? []).map((match) => match.route.path);
}

function topLevelRouteOrder(): Array<string> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return buildRoutes(queryClient).map((route) => {
    if (route.id) return route.id;
    if (route.children?.some((child) => child.path === "*")) return "public-catch-all-tree";
    return route.path ?? "pathless";
  });
}

describe("router route order", () => {
  it("composes app route trees before the public catch-all tree", () => {
    const order = topLevelRouteOrder();
    expect(order.indexOf("app-admin")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("public-catch-all-tree")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("app-admin")).toBeLessThan(order.indexOf("public-catch-all-tree"));
  });

  it("composes host route trees before member route trees", () => {
    const order = topLevelRouteOrder();
    expect(order.indexOf("app-host")).toBeLessThan(order.indexOf("/app"));
    expect(order.indexOf("club-app-host")).toBeLessThan(order.indexOf("club-app"));
  });

  it("matches admin routes before the public catch-all", () => {
    expect(routeIdsFor("/admin/today")).toContain("app-admin");
    expect(routeIdsFor("/admin/clubs/club-1")).toContain("app-admin");
    expect(routePathsFor("/admin/today")).not.toEqual(expect.arrayContaining(["*"]));
  });

  it("matches unscoped host routes before the member wildcard", () => {
    expect(routeIdsFor("/app/host")).toContain("app-host");
    expect(routeIdsFor("/app/host/members")).toContain("app-host");
    expect(routePathsFor("/app/host/members")).not.toEqual(expect.arrayContaining(["*"]));
  });

  it("matches club-scoped host routes before the member wildcard", () => {
    expect(routeIdsFor("/clubs/reading-sai/app/host")).toContain("club-app-host");
    expect(routeIdsFor("/clubs/reading-sai/app/host/members")).toContain("club-app-host");
    expect(routePathsFor("/clubs/reading-sai/app/host/members")).not.toEqual(expect.arrayContaining(["*"]));
  });

  it("matches host session detail routes before host and member wildcards", () => {
    const hostPaths = [
      { pathname: "/app/host/sessions/new", routeId: "app-host" },
      { pathname: "/app/host/sessions/session-7/edit", routeId: "app-host" },
      { pathname: "/app/host/sessions/session-7/closing", routeId: "app-host" },
      { pathname: "/clubs/reading-sai/app/host/sessions/new", routeId: "club-app-host" },
      { pathname: "/clubs/reading-sai/app/host/sessions/session-7/edit", routeId: "club-app-host" },
      { pathname: "/clubs/reading-sai/app/host/sessions/session-7/closing", routeId: "club-app-host" },
    ];

    for (const { pathname, routeId } of hostPaths) {
      expect(routeIdsFor(pathname)).toEqual(expect.arrayContaining([routeId]));
      expect(routePathsFor(pathname)).not.toEqual(expect.arrayContaining(["*"]));
    }
  });

  it("keeps public unknown routes on the public not-found branch", () => {
    expect(routeIdsFor("/unknown-public-route")).not.toContain("app-admin");
    expect(routePathsFor("/unknown-public-route")).toEqual(expect.arrayContaining(["*"]));
  });
});
