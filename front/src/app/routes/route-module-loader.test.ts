import { describe, expect, it, vi } from "vitest";
import { memoizeRouteModule } from "./route-module-loader";

describe("memoizeRouteModule", () => {
  it("assembles a route module once when its loader and element request it", async () => {
    const load = vi.fn(async () => ({ loader: "protected-loader", Component: "ProtectedComponent" }));
    const loadOnce = memoizeRouteModule(load);

    const [forLoader, forElement] = await Promise.all([loadOnce(), loadOnce()]);

    expect(forLoader).toBe(forElement);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
