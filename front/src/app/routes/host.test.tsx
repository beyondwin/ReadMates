import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RouteObject } from "react-router";
import { hostRoutes } from "./host";

function childPaths(route: RouteObject | undefined) {
  return (route?.children ?? []).map((child) => (child.index ? "index" : child.path));
}

describe("hostRoutes", () => {
  it("registers operations beside notifications in unscoped and scoped trees", () => {
    const routes = hostRoutes(new QueryClient());
    const unscoped = routes.find((route) => route.id === "app-host");
    const scoped = routes.find((route) => route.id === "club-app-host");

    const unscopedPaths = childPaths(unscoped);
    const scopedPaths = childPaths(scoped);

    expect(unscopedPaths.indexOf("operations")).toBe(unscopedPaths.indexOf("notifications") + 1);
    expect(scopedPaths.indexOf("operations")).toBe(scopedPaths.indexOf("notifications") + 1);
  });
});
