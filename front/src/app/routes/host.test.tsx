import { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs, RouteObject } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hostRoutes } from "./host";

function childPaths(route: RouteObject | undefined) {
  return (route?.children ?? []).map((child) => (child.index ? "index" : child.path));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("host compatibility routes", () => {
  it("replaces an unscoped host entry with its current-club canonical URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              authenticated: true,
              membershipId: "membership-1",
              role: "HOST",
              membershipStatus: "ACTIVE",
              approvalState: "ACTIVE",
              currentMembership: { clubSlug: "reading-sai" },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );
    const compatibilityRoute = hostRoutes(new QueryClient()).find((route) => route.id === "app-host") as RouteObject;
    const loader = compatibilityRoute.loader! as (args: LoaderFunctionArgs) => Promise<unknown>;

    await expect(
      loader({
        request: new Request("https://readmates.local/app/host/sessions?cursor=old#draft"),
        params: {},
        context: undefined,
      }),
    ).rejects.toMatchObject({
      status: 302,
      headers: expect.objectContaining({ get: expect.any(Function) }),
    });

    try {
      await loader({
        request: new Request("https://readmates.local/app/host/sessions?cursor=old#draft"),
        params: {},
        context: undefined,
      });
    } catch (response) {
      expect((response as Response).headers.get("Location")).toBe(
        "/clubs/reading-sai/app/host/sessions?cursor=old#draft",
      );
    }
  });
});

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
