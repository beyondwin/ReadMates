import { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs, RouteObject } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const canonicalModuleState = {
  peopleEvaluated: false,
  recordsEvaluated: false,
  settingsEvaluated: false,
};

function canonicalChild(routes: RouteObject[], routeId: string, path: string) {
  return routes
    .find((route) => route.id === routeId)
    ?.children?.find((route) => route.path === path);
}

function installCanonicalRouteMocks() {
  vi.doMock("@/src/app/host-routes/people-route-element", () => {
    canonicalModuleState.peopleEvaluated = true;
    return { HostPeopleRouteElement: () => null };
  });
  vi.doMock("@/src/app/host-routes/records-route-element", () => {
    canonicalModuleState.recordsEvaluated = true;
    return { HostRecordsRouteElement: () => null };
  });
  vi.doMock("@/src/app/host-routes/settings-route-element", () => {
    canonicalModuleState.settingsEvaluated = true;
    return { HostSettingsRouteElement: () => null };
  });
  vi.doMock("@/features/host/route/host-members-data", () => ({
    hostMembersLoaderFactory: () => async () => null,
  }));
  vi.doMock("@/features/host/route/host-meeting-list-data", () => ({
    hostMeetingListLoaderFactory: () => async () => null,
  }));
}

afterEach(() => {
  canonicalModuleState.peopleEvaluated = false;
  canonicalModuleState.recordsEvaluated = false;
  canonicalModuleState.settingsEvaluated = false;
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("@/src/app/host-routes/people-route-element");
  vi.doUnmock("@/src/app/host-routes/records-route-element");
  vi.doUnmock("@/src/app/host-routes/settings-route-element");
  vi.doUnmock("@/features/host/route/host-members-data");
  vi.doUnmock("@/features/host/route/host-meeting-list-data");
});

describe("canonical host lazy route boundaries", () => {
  it("does not evaluate people, records, or settings presentation while route definitions load", async () => {
    installCanonicalRouteMocks();

    const { hostRoutes } = await import("./host");
    const routes = hostRoutes(new QueryClient());

    expect(canonicalModuleState).toEqual({
      peopleEvaluated: false,
      recordsEvaluated: false,
      settingsEvaluated: false,
    });

    const peopleLazy = canonicalChild(routes, "app-host", "people")?.lazy as
      | (() => Promise<unknown>)
      | undefined;
    await peopleLazy?.();
    expect(canonicalModuleState.peopleEvaluated).toBe(true);
    expect(canonicalModuleState.recordsEvaluated).toBe(false);
    expect(canonicalModuleState.settingsEvaluated).toBe(false);

    const recordsLazy = canonicalChild(routes, "app-host", "records")?.lazy as
      | (() => Promise<unknown>)
      | undefined;
    await recordsLazy?.();
    expect(canonicalModuleState.recordsEvaluated).toBe(true);
    expect(canonicalModuleState.settingsEvaluated).toBe(false);

    const settingsLazy = canonicalChild(routes, "app-host", "settings")?.lazy as
      | (() => Promise<unknown>)
      | undefined;
    await settingsLazy?.();
    expect(canonicalModuleState.settingsEvaluated).toBe(true);
  });

  it("does not evaluate scoped presentation before host authorization succeeds", async () => {
    installCanonicalRouteMocks();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({
      authenticated: true,
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
    }))));
    const { hostRoutes } = await import("./host");
    const routes = hostRoutes(new QueryClient());

    for (const path of ["people", "records", "settings"]) {
      const loader = canonicalChild(routes, "club-app-host", path)?.loader as
        | ((args: LoaderFunctionArgs) => Promise<unknown>)
        | undefined;

      await expect(loader!({
        request: new Request(`https://readmates.local/clubs/reading-sai/app/host/${path}`),
        params: { clubSlug: "reading-sai" },
        context: undefined,
      } as unknown as LoaderFunctionArgs)).rejects.toMatchObject({ status: 302 });
    }

    expect(canonicalModuleState).toEqual({
      peopleEvaluated: false,
      recordsEvaluated: false,
      settingsEvaluated: false,
    });
  });
});
