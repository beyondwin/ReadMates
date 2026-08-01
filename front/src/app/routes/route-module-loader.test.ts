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

  it("shares a failed load attempt, then retries on a later request", async () => {
    const failure = new Error("route module unavailable");
    const module = { loader: "protected-loader", Component: "ProtectedComponent" };
    const load = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(module);
    const loadOnce = memoizeRouteModule(load);

    const [forLoader, forElement] = await Promise.allSettled([loadOnce(), loadOnce()]);

    expect(forLoader).toEqual({ status: "rejected", reason: failure });
    expect(forElement).toEqual({ status: "rejected", reason: failure });
    expect(load).toHaveBeenCalledTimes(1);

    await expect(loadOnce()).resolves.toBe(module);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
