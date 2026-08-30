import { describe, expect, it } from "vitest";
import {
  HOST_ROUTE_DESTINATION_INVENTORY,
  hostCompatibilityRedirectTarget,
} from "./route-continuity";
import { HOST_ROUTE_HREFS, HOST_ROUTE_PATHS } from "@/shared/routing/host-route-destinations";

describe("host route destination inventory", () => {
  it("owns the four canonical host areas with distinct scoped and compatibility hrefs", () => {
    const primary = HOST_ROUTE_DESTINATION_INVENTORY.filter((entry) => entry.kind === "host-primary");
    expect(primary).toEqual([
      {
        owner: "host-operating-room",
        kind: "host-primary",
        href: "/app/host",
        scopedHref: "/clubs/:slug/app/host",
        lifecycle: null,
        returnHref: "/app/host",
      },
      {
        owner: "host-meetings",
        kind: "host-primary",
        href: "/app/host/sessions",
        scopedHref: "/clubs/:slug/app/host/sessions",
        lifecycle: null,
        returnHref: "/app/host/sessions",
      },
      {
        owner: "host-people",
        kind: "host-primary",
        href: "/app/host/people",
        scopedHref: "/clubs/:slug/app/host/people",
        lifecycle: null,
        returnHref: "/app/host/people",
      },
      {
        owner: "host-records",
        kind: "host-primary",
        href: "/app/host/records",
        scopedHref: "/clubs/:slug/app/host/records",
        lifecycle: null,
        returnHref: "/app/host/records",
      },
    ]);
    expect(new Set(primary.map((entry) => entry.href)).size).toBe(4);
    expect(new Set(primary.map((entry) => entry.scopedHref)).size).toBe(4);
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

  it("owns all five host utility and action entry points outside primary navigation", () => {
    const utilityAndActions = HOST_ROUTE_DESTINATION_INVENTORY.filter(
      (entry) => entry.kind === "host-utility" || entry.kind === "host-action",
    );

    expect(utilityAndActions).toEqual([
      expect.objectContaining({ owner: "host-settings", kind: "host-utility", href: "/app/host/settings", scopedHref: "/clubs/:slug/app/host/settings" }),
      expect.objectContaining({ owner: "host-member-view", kind: "host-utility", href: "/app", scopedHref: "/clubs/:slug/app" }),
      expect.objectContaining({ owner: "host-notifications", kind: "host-utility", href: "/app/host/notifications", scopedHref: "/clubs/:slug/app/host/notifications" }),
      expect.objectContaining({ owner: "host-account", kind: "host-utility", href: "/app/me/settings", scopedHref: "/clubs/:slug/app/me/settings" }),
      expect.objectContaining({ owner: "host-new-meeting", kind: "host-action", href: "/app/host/sessions/new", scopedHref: "/clubs/:slug/app/host/sessions/new" }),
    ]);
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
      "host-settings",
      "host-notifications",
      "host-new-meeting",
      "host-session-edit",
      "host-session-closing",
      "host-schedule-review",
      "host-feedback-document",
      "host-meeting-detail",
      "host-record-detail",
      "host-trash-compatibility",
    ]));
  });

  it("defines the canonical child path and href contract", () => {
    expect(HOST_ROUTE_PATHS).toMatchObject({
      operatingRoom: "",
      meetings: "sessions",
      people: "people",
      records: "records",
      settings: "settings",
      notifications: "notifications",
      newSession: "sessions/new",
      sessionDetail: "sessions/:sessionId",
      sessionEdit: "sessions/:sessionId/edit",
      sessionClosing: "sessions/:sessionId/closing",
      scheduleReview: "sessions/:sessionId/schedule-review",
      personDetail: "people/:membershipId",
    });
    expect(HOST_ROUTE_HREFS).toMatchObject({
      operatingRoom: "/app/host",
      meetings: "/app/host/sessions",
      people: "/app/host/people",
      records: "/app/host/records",
      settings: "/app/host/settings",
      notifications: "/app/host/notifications",
      newSession: "/app/host/sessions/new",
      sessionDetail: "/app/host/sessions/:sessionId",
      sessionEdit: "/app/host/sessions/:sessionId/edit",
      sessionClosing: "/app/host/sessions/:sessionId/closing",
      scheduleReview: "/app/host/sessions/:sessionId/schedule-review",
      personDetail: "/app/host/people/:membershipId",
    });
    expect(HOST_ROUTE_HREFS.trashCompatibility).toBe(`${HOST_ROUTE_HREFS.meetings}?view=trash`);
  });

  it("keeps only the named legacy aliases as exact compatibility redirect entries", () => {
    expect(HOST_ROUTE_PATHS).toMatchObject({
      today: "",
      members: "members",
      invitations: "invitations",
      operations: "operations",
    });
    expect(HOST_ROUTE_HREFS).toMatchObject({
      today: "/app/host",
      members: "/app/host/members",
      invitations: "/app/host/invitations",
      operations: "/app/host/operations",
    });
    expect(HOST_ROUTE_DESTINATION_INVENTORY.filter((entry) => entry.kind === "compatibility"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ owner: "host-members-compatibility", returnHref: "/app/host/people" }),
        expect.objectContaining({ owner: "host-invitations-compatibility", returnHref: "/app/host/settings" }),
        expect.objectContaining({ owner: "host-operations-compatibility", returnHref: "/app/host" }),
      ]));
  });

  it.each([
    ["/app/host/members", "/app/host/people"],
    ["/app/host/invitations", "/app/host/settings#invitations"],
    ["/app/host/operations", "/app/host"],
    ["/clubs/reading-sai/app/host/members", "/clubs/reading-sai/app/host/people"],
    ["/clubs/reading-sai/app/host/invitations", "/clubs/reading-sai/app/host/settings#invitations"],
    ["/clubs/reading-sai/app/host/operations", "/clubs/reading-sai/app/host"],
  ])("maps only the approved compatibility pathname %s", (pathname, expected) => {
    expect(hostCompatibilityRedirectTarget({ pathname })).toBe(expected);
  });

  it.each([
    "/app/host/records",
    "/clubs/reading-sai/app/host/records",
    "/app/host/sessions/session-previous/edit",
    "/clubs/reading-sai/app/host/sessions/session-previous/closing",
  ])("does not redirect canonical or non-current session deep link %s", (pathname) => {
    expect(hostCompatibilityRedirectTarget({ pathname, search: "?from=bookmark", hash: "#focus" }))
      .toBeNull();
  });

  it("assigns canonical return ownership to session, person, and record details", () => {
    expect(HOST_ROUTE_DESTINATION_INVENTORY).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: "host-meeting-detail", href: HOST_ROUTE_HREFS.sessionDetail, returnHref: HOST_ROUTE_HREFS.meetings }),
      expect.objectContaining({ owner: "host-person-detail", href: HOST_ROUTE_HREFS.personDetail, returnHref: HOST_ROUTE_HREFS.people }),
      expect.objectContaining({ owner: "host-record-detail", href: HOST_ROUTE_HREFS.sessionDetail, returnHref: HOST_ROUTE_HREFS.records }),
    ]));
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
