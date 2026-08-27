import { describe, expect, it } from "vitest";
import { HOST_ROUTE_DESTINATION_INVENTORY } from "./route-continuity";
import { HOST_ROUTE_HREFS, HOST_ROUTE_PATHS } from "@/shared/routing/host-route-destinations";

describe("host route destination inventory", () => {
  it("keeps the three primary host destinations distinct", () => {
    const primary = HOST_ROUTE_DESTINATION_INVENTORY.filter((entry) => entry.kind === "host-primary");
    expect(primary.map((entry) => entry.href)).toEqual([
      "/app/host",
      "/app/host/sessions",
      "/app/host/members",
    ]);
    expect(new Set(primary.map((entry) => entry.href)).size).toBe(3);
    expect(primary.map((entry) => entry.scopedHref)).toEqual([
      "/clubs/:slug/app/host",
      "/clubs/:slug/app/host/sessions",
      "/clubs/:slug/app/host/members",
    ]);
    expect(new Set(primary.map((entry) => entry.scopedHref)).size).toBe(3);
    expect(primary.some((entry) => entry.owner === "host-records" || entry.href === "/app/host/records")).toBe(false);
  });

  it("routes meeting lifecycle owners on the absorbed meetings list", () => {
    for (const entry of HOST_ROUTE_DESTINATION_INVENTORY) {
      if (
        entry.owner === "host-draft-list"
        || entry.owner === "host-open-list"
        || entry.owner === "host-closed-list"
        || entry.owner === "host-published-list"
      ) {
        expect(entry.href, entry.owner).toBe("/app/host/sessions");
        expect(entry.scopedHref, entry.owner).toBe("/clubs/:slug/app/host/sessions");
      }
    }
  });

  it("keeps the records redirect as a non-primary compatibility destination", () => {
    expect(HOST_ROUTE_DESTINATION_INVENTORY).toContainEqual({
      owner: "host-records",
      kind: "compatibility",
      href: HOST_ROUTE_HREFS.records,
      scopedHref: "/clubs/:slug/app/host/records",
      lifecycle: null,
    });
  });

  it("inventories scoped counterparts for every member, host, and public destination", () => {
    for (const entry of HOST_ROUTE_DESTINATION_INVENTORY) {
      expect(entry.scopedHref, entry.owner).toMatch(/^\/clubs\/:slug(?:\/|$)/);
    }
  });

  it("covers every canonical production host destination", () => {
    const inventoried = new Set(HOST_ROUTE_DESTINATION_INVENTORY.map((entry) => entry.href));
    expect(Object.values(HOST_ROUTE_HREFS).every((href) => inventoried.has(href))).toBe(true);
    expect(HOST_ROUTE_DESTINATION_INVENTORY.map((entry) => entry.owner)).toEqual(expect.arrayContaining([
      "host-invitations",
      "host-notifications",
      "host-operations",
      "host-new-meeting",
      "host-session-edit",
      "host-session-closing",
      "host-feedback-document",
      "host-meeting-detail",
      "host-record-detail",
      "host-trash-compatibility",
    ]));
  });

  it("derives every production route href from the exact registered child path", () => {
    for (const key of Object.keys(HOST_ROUTE_PATHS) as Array<keyof typeof HOST_ROUTE_PATHS>) {
      expect(HOST_ROUTE_HREFS[key]).toBe(`/app/host${HOST_ROUTE_PATHS[key] ? `/${HOST_ROUTE_PATHS[key]}` : ""}`);
    }
    expect(HOST_ROUTE_HREFS.trashCompatibility).toBe(`${HOST_ROUTE_HREFS.meetings}?view=trash`);
  });

  it("documents the only compatibility trash entry", () => {
    expect(HOST_ROUTE_DESTINATION_INVENTORY).toContainEqual({
      owner: "host-trash-compatibility",
      kind: "compatibility",
      href: "/app/host/sessions?view=trash",
      scopedHref: "/clubs/:slug/app/host/sessions?view=trash",
      lifecycle: null,
    });
    expect(HOST_ROUTE_DESTINATION_INVENTORY.some((entry) => entry.href.startsWith("/app/host/records?view=trash")))
      .toBe(false);
  });
});
