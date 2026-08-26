import { describe, expect, it } from "vitest";
import { buildAdminDetailHref, parseAdminRouteReturnState } from "./admin-route-state";

const clubsFallback = "/admin/clubs";
const clubsAllowed = { fallback: clubsFallback, allowedPath: "/admin/clubs" };

describe("buildAdminDetailHref", () => {
  it("serializes same-origin admin return, focus, and scroll into the detail href", () => {
    expect(
      buildAdminDetailHref("/admin/clubs/club-reading-sai", {
        returnTo: "/admin/clubs?search=alpha",
        focusId: "club-reading-sai",
        scrollTop: 240,
      }),
    ).toBe(
      "/admin/clubs/club-reading-sai?returnTo=%2Fadmin%2Fclubs%3Fsearch%3Dalpha&focusId=club-reading-sai&scrollTop=240",
    );
  });
});

describe("parseAdminRouteReturnState", () => {
  it("accepts same-origin /admin paths inside the allowed primary area", () => {
    const params = new URLSearchParams({
      returnTo: "/admin/clubs?search=alpha",
      focusId: "club-reading-sai",
      scrollTop: "240",
    });

    expect(parseAdminRouteReturnState(params, clubsAllowed)).toEqual({
      returnTo: "/admin/clubs?search=alpha",
      focusId: "club-reading-sai",
      scrollTop: 240,
    });
  });

  it("accepts a bounded club detail path when the caller allows clubs", () => {
    const params = new URLSearchParams({
      returnTo: "/admin/clubs/club-reading-sai",
      focusId: "row_1",
      scrollTop: "0",
    });

    expect(parseAdminRouteReturnState(params, clubsAllowed)).toEqual({
      returnTo: "/admin/clubs/club-reading-sai",
      focusId: "row_1",
      scrollTop: 0,
    });
  });

  it("rejects an external URL and falls back to the allowed list", () => {
    const params = new URLSearchParams({
      returnTo: "https://external.example/admin/clubs",
      focusId: "club-reading-sai",
      scrollTop: "12",
    });

    expect(parseAdminRouteReturnState(params, clubsAllowed)).toEqual({
      returnTo: clubsFallback,
      focusId: "club-reading-sai",
      scrollTop: 12,
    });
  });

  it("rejects a different primary area when the caller allows only clubs", () => {
    const params = new URLSearchParams({
      returnTo: "/admin/today",
      focusId: "case-1",
      scrollTop: "8",
    });

    expect(parseAdminRouteReturnState(params, clubsAllowed)).toEqual({
      returnTo: clubsFallback,
      focusId: "case-1",
      scrollTop: 8,
    });
  });

  it("rejects encoded control characters in return and focus", () => {
    expect(
      parseAdminRouteReturnState(
        new URLSearchParams({
          returnTo: "/admin/clubs%0d%0a",
          focusId: "row%0a1",
          scrollTop: "4",
        }),
        clubsAllowed,
      ),
    ).toEqual({
      returnTo: clubsFallback,
      focusId: null,
      scrollTop: 4,
    });
  });

  it("rejects negative and huge scroll offsets", () => {
    expect(
      parseAdminRouteReturnState(
        new URLSearchParams({
          returnTo: "/admin/clubs",
          scrollTop: "-1",
        }),
        clubsAllowed,
      ),
    ).toEqual({
      returnTo: "/admin/clubs",
      focusId: null,
      scrollTop: 0,
    });

    expect(
      parseAdminRouteReturnState(
        new URLSearchParams({
          returnTo: "/admin/clubs",
          scrollTop: "1000001",
        }),
        clubsAllowed,
      ),
    ).toEqual({
      returnTo: "/admin/clubs",
      focusId: null,
      scrollTop: 0,
    });
  });
});
