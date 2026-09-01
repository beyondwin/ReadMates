import { QueryClient } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider, type LoaderFunctionArgs, type RouteObject } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hostRoutes } from "./host";

function childPaths(route: RouteObject | undefined) {
  return (route?.children ?? []).map((child) => (child.index ? "index" : child.path));
}

function combinedCompatibilityRoutes(destinationChildPath: string | null) {
  return hostRoutes(new QueryClient()).map((route) => ({
    ...route,
    element: <Outlet />,
    children: route.children?.map((child) => {
      const isDestination = destinationChildPath === null
        ? child.index === true
        : child.path === destinationChildPath;
      if (!isDestination) {
        return child;
      }
      return destinationChildPath === null
        ? { index: true, element: <main>canonical destination</main> }
        : { path: destinationChildPath, element: <main>canonical destination</main> };
    }),
  }));
}

function stubHostAuth() {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
    authenticated: true,
    membershipId: "membership-1",
    role: "HOST",
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
    currentMembership: { clubSlug: "reading-sai" },
  }), { headers: { "Content-Type": "application/json" } }))));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("host compatibility routes", () => {
  it("authorizes an unscoped host entry and returns only the loader-owned current club", async () => {
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

    await expect(loader({
      request: new Request("https://readmates.local/app/host/sessions?cursor=old"),
      params: {},
      context: undefined,
    } as unknown as LoaderFunctionArgs)).resolves.toEqual({
      hostCompatibilityClubSlug: "reading-sai",
    });
  });

  it.each([
    ["members", "people", "#member-7", "/clubs/reading-sai/app/host/people#member-7"],
    ["invitations", "settings", "#obsolete-invitations", "/clubs/reading-sai/app/host/settings#invitations"],
    ["operations", null, "#current-work", "/clubs/reading-sai/app/host#current-work"],
  ])("replaces the real combined unscoped %s route once without leaving a legacy Back entry", async (
    legacyPath,
    destinationChildPath,
    incomingHash,
    expectedHref,
  ) => {
    stubHostAuth();
    const initialState = {
      readmatesReturnTo: "/app/host/records?view=all#session-7",
      readmatesReturnLabel: "기록으로",
    };
    const expectedState = {
      readmatesReturnTo: "/clubs/reading-sai/app/host/records?view=all#session-7",
      readmatesReturnLabel: "기록으로",
    };
    const scopedLegacyPath = `/clubs/reading-sai/app/host/${legacyPath}`;
    const visited = new Set<string>();
    const router = createMemoryRouter([
      { path: "/before", element: <main>before</main> },
      ...combinedCompatibilityRoutes(destinationChildPath),
    ], {
      initialEntries: [
        "/before",
        {
          pathname: `/app/host/${legacyPath}`,
          search: "?status=active",
          hash: incomingHash,
          state: initialState,
        },
      ],
      initialIndex: 1,
    });
    router.subscribe((state) => {
      visited.add(state.location.pathname);
    });

    render(<RouterProvider router={router} />);
    const expected = new URL(expectedHref, "https://readmates.local");
    await waitFor(() => expect(router.state.location.pathname).toBe(expected.pathname));
    expect.soft(router.state.historyAction).toBe("REPLACE");
    expect.soft(router.state.location.search).toBe("?status=active");
    expect.soft(router.state.location.hash).toBe(expected.hash);
    expect.soft(router.state.location.state).toEqual(expectedState);
    expect.soft(visited).not.toContain(scopedLegacyPath);

    await act(async () => router.navigate(-1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/before"));

    await act(async () => router.navigate(1));
    await waitFor(() => expect(router.state.location.pathname).toBe(expected.pathname));
    expect(router.state.location.state).toEqual(expectedState);
  });

  it.each([
    ["external", "https://evil.example/app/host/records"],
    ["cross-club", "/clubs/other-club/app/host/records"],
  ])("drops %s route state through the real combined unscoped invitation redirect", async (_name, readmatesReturnTo) => {
    stubHostAuth();
    const router = createMemoryRouter(combinedCompatibilityRoutes("settings"), {
      initialEntries: [{
        pathname: "/app/host/invitations",
        state: {
          readmatesReturnTo,
          readmatesReturnLabel: "unsafe",
          clubSlug: "other-club",
        },
      }],
    });

    render(<RouterProvider router={router} />);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host/settings");
    });
    expect(router.state.location.hash).toBe("#invitations");
    expect(router.state.location.state).toBeNull();
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

  it("registers four distinct primary host destinations in both route trees", () => {
    const routes = hostRoutes(new QueryClient());

    for (const routeId of ["app-host", "club-app-host"]) {
      const route = routes.find((candidate) => candidate.id === routeId);
      expect(childPaths(route)).toEqual(expect.arrayContaining([
        "index",
        "sessions",
        "people",
        "records",
      ]));
    }
  });

  it("registers canonical people, records, and settings without removing compatibility routes", () => {
    const routes = hostRoutes(new QueryClient());

    for (const routeId of ["app-host", "club-app-host"]) {
      const route = routes.find((candidate) => candidate.id === routeId);
      expect(childPaths(route)).toEqual(expect.arrayContaining([
        "people",
        "records",
        "settings",
        "members",
        "invitations",
        "operations",
      ]));
    }
  });

  it.each([
    ["members", "HostMembersRedirectElement"],
    ["invitations", "HostInvitationsRedirectElement"],
    ["operations", "HostOperationsRedirectElement"],
  ])("loads only the %s compatibility redirect in the unscoped route", async (path, componentName) => {
    const route = hostRoutes(new QueryClient())
      .find((candidate) => candidate.id === "app-host")
      ?.children?.find((candidate) => candidate.path === path);

    const module = await route?.lazy?.({} as never);
    expect(module?.Component?.name).toBe(componentName);
    expect(module?.loader).toBeUndefined();
  });

  it.each([
    ["members", "/clubs/reading-sai/app/host/people"],
    ["invitations", "/clubs/reading-sai/app/host/settings#invitations"],
    ["operations", "/clubs/reading-sai/app/host"],
  ])("renders only the scoped %s compatibility redirect", async (path, destination) => {
    const route = hostRoutes(new QueryClient())
      .find((candidate) => candidate.id === "club-app-host")
      ?.children?.find((candidate) => candidate.path === path);
    const destinationUrl = new URL(destination, "https://readmates.local");
    const router = createMemoryRouter([
      { path: `/clubs/:clubSlug/app/host/${path}`, element: route?.element },
      { path: destinationUrl.pathname, element: <div>canonical</div> },
    ], { initialEntries: [`/clubs/reading-sai/app/host/${path}`] });

    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.location.pathname).toBe(destinationUrl.pathname));
    expect(router.state.location.hash).toBe(destinationUrl.hash);
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("registers the schedule review route in both scoped and compatibility trees", () => {
    const routes = hostRoutes(new QueryClient());

    for (const routeId of ["app-host", "club-app-host"]) {
      const route = routes.find((candidate) => candidate.id === routeId);
      expect(childPaths(route)).toContain("sessions/:sessionId/schedule-review");
    }
  });

  it("registers the dedicated person detail route in both route trees", () => {
    const routes = hostRoutes(new QueryClient());

    for (const routeId of ["app-host", "club-app-host"]) {
      const route = routes.find((candidate) => candidate.id === routeId);
      expect(childPaths(route)).toContain("people/:membershipId");
    }
  });

  it.each(["people", "records", "settings"])(
    "keeps the unscoped %s destination behind a lazy route module",
    (path) => {
      const route = hostRoutes(new QueryClient())
        .find((candidate) => candidate.id === "app-host")
        ?.children?.find((candidate) => candidate.path === path);

      expect(route?.lazy).toEqual(expect.any(Function));
      expect(route?.Component).toBeUndefined();
      expect(route?.element).toBeUndefined();
    },
  );

  it.each(["people", "records", "settings"])(
    "guards the scoped %s destination with host loader authorization",
    async (path) => {
      const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
        authenticated: true,
        role: "MEMBER",
        membershipStatus: "ACTIVE",
        approvalState: "ACTIVE",
      }), { headers: { "Content-Type": "application/json" } })));
      vi.stubGlobal("fetch", fetchMock);
      const route = hostRoutes(new QueryClient())
        .find((candidate) => candidate.id === "club-app-host")
        ?.children?.find((candidate) => candidate.path === path);
      const loader = route?.loader as ((args: LoaderFunctionArgs) => Promise<unknown>) | undefined;

      expect(loader).toEqual(expect.any(Function));
      await expect(loader!({
        request: new Request(`https://readmates.local/clubs/reading-sai/app/host/${path}`),
        params: { clubSlug: "reading-sai" },
        context: undefined,
      } as unknown as LoaderFunctionArgs)).rejects.toMatchObject({ status: 302 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});
