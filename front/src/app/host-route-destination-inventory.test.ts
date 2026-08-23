import { describe, expect, it } from "vitest";
import { HOST_ROUTE_DESTINATION_INVENTORY } from "./route-continuity";

describe("host route destination inventory", () => {
  it("keeps the four primary host destinations distinct", () => {
    const primary = HOST_ROUTE_DESTINATION_INVENTORY.filter((entry) => entry.kind === "host-primary");
    expect(primary.map((entry) => entry.href)).toEqual([
      "/app/host",
      "/app/host/sessions",
      "/app/host/members",
      "/app/host/records",
    ]);
    expect(new Set(primary.map((entry) => entry.href)).size).toBe(4);
    expect(primary.map((entry) => entry.scopedHref)).toEqual([
      "/clubs/:slug/app/host",
      "/clubs/:slug/app/host/sessions",
      "/clubs/:slug/app/host/members",
      "/clubs/:slug/app/host/records",
    ]);
    expect(new Set(primary.map((entry) => entry.scopedHref)).size).toBe(4);
  });

  it("routes meeting and record lifecycle owners without conflating their lists", () => {
    for (const entry of HOST_ROUTE_DESTINATION_INVENTORY) {
      if (entry.owner === "host-draft-list" || entry.owner === "host-open-list") {
        expect(entry.href, entry.owner).toBe("/app/host/sessions");
        expect(entry.scopedHref, entry.owner).toBe("/clubs/:slug/app/host/sessions");
      }
      if (entry.owner === "host-closed-list" || entry.owner === "host-published-list") {
        expect(entry.href, entry.owner).toBe("/app/host/records");
        expect(entry.scopedHref, entry.owner).toBe("/clubs/:slug/app/host/records");
      }
    }
  });

  it("inventories scoped counterparts for every member, host, and public destination", () => {
    for (const entry of HOST_ROUTE_DESTINATION_INVENTORY) {
      expect(entry.scopedHref, entry.owner).toMatch(/^\/clubs\/:slug(?:\/|$)/);
    }
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
