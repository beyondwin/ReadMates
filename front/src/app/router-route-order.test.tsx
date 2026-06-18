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

  it("matches admin routes before the public catch-all", () => {
    expect(routeIdsFor("/admin/today")).toContain("app-admin");
    expect(routeIdsFor("/admin/clubs/club-1")).toContain("app-admin");
    expect(routePathsFor("/admin/today")).not.toEqual(expect.arrayContaining(["*"]));
  });

  it("keeps public unknown routes on the public not-found branch", () => {
    expect(routeIdsFor("/unknown-public-route")).not.toContain("app-admin");
    expect(routePathsFor("/unknown-public-route")).toEqual(expect.arrayContaining(["*"]));
  });
});
