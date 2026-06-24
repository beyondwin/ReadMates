import { describe, expect, it } from "vitest";
import {
  LIGHTHOUSE_ROUTE_INVENTORY,
  READING_SAI_FIXTURES,
  filterRoutes,
} from "./route-inventory";

describe("LIGHTHOUSE_ROUTE_INVENTORY", () => {
  it("keeps route ids unique", () => {
    const ids = LIGHTHOUSE_ROUTE_INVENTORY.map((route) => route.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers public member host and admin groups", () => {
    expect(new Set(LIGHTHOUSE_ROUTE_INVENTORY.map((route) => route.group))).toEqual(
      new Set(["public", "member", "host", "admin"]),
    );
  });

  it("uses stable dev-seed constants for seeded paths", () => {
    expect(READING_SAI_FIXTURES.clubId).toBe("00000000-0000-0000-0000-000000000001");
    expect(READING_SAI_FIXTURES.slug).toBe("reading-sai");
    expect(READING_SAI_FIXTURES.publicSessionId).toBe("00000000-0000-0000-0000-000000000301");
    expect(READING_SAI_FIXTURES.memberSessionId).toBe("00000000-0000-0000-0000-000000000301");
  });

  it("marks authenticated routes with the matching auth account", () => {
    const memberRoutes = LIGHTHOUSE_ROUTE_INVENTORY.filter((route) => route.group === "member");
    const hostRoutes = LIGHTHOUSE_ROUTE_INVENTORY.filter((route) => route.group === "host");
    const adminRoutes = LIGHTHOUSE_ROUTE_INVENTORY.filter((route) => route.group === "admin");

    expect(memberRoutes.every((route) => route.auth === "member")).toBe(true);
    expect(hostRoutes.every((route) => route.auth === "host")).toBe(true);
    expect(adminRoutes.every((route) => route.auth === "admin")).toBe(true);
  });

  it("filters by group route id and limit", () => {
    const filtered = filterRoutes(LIGHTHOUSE_ROUTE_INVENTORY, {
      group: "public",
      routeId: undefined,
      limit: 2,
    });

    expect(filtered).toHaveLength(2);
    expect(filtered.every((route) => route.group === "public")).toBe(true);

    const oneRoute = filterRoutes(LIGHTHOUSE_ROUTE_INVENTORY, {
      group: undefined,
      routeId: "admin-today",
      limit: undefined,
    });

    expect(oneRoute.map((route) => route.id)).toEqual(["admin-today"]);
  });
});
