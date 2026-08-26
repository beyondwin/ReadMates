import { describe, expect, it } from "vitest";
import {
  platformAdminClubListFiltersFromSearch,
  platformAdminClubListHref,
  platformAdminClubListSearchParamsFromFilters,
} from "./platform-admin-club-list-filters";

describe("platformAdminClubListFiltersFromSearch", () => {
  it("preserves current search, lifecycle, visibility, domain, and onboarding filters", () => {
    expect(
      platformAdminClubListFiltersFromSearch(
        new URLSearchParams(
          "search=alpha&lifecycle=ACTIVE&visibility=PRIVATE&domainStatus=ACTION_REQUIRED&onboardingState=MISSING",
        ),
      ),
    ).toEqual({
      search: "alpha",
      lifecycle: "ACTIVE",
      visibility: "PRIVATE",
      domainStatus: "ACTION_REQUIRED",
      onboardingState: "MISSING",
      limit: 25,
    });
  });

  it("drops cursor, onboarding modal, return restoration, and values outside the allowlists", () => {
    expect(
      platformAdminClubListFiltersFromSearch(
        new URLSearchParams(
          "search=%20&lifecycle=DROP&visibility=SECRET&domainStatus=RAW&onboardingState=OWNER&cursor=private-cursor&onboarding=1&focusId=c-1&scrollTop=240",
        ),
      ),
    ).toEqual({ limit: 25 });
  });
});

describe("platformAdminClubListHref", () => {
  it("serializes only URL-safe registry filters into the list return path", () => {
    const href = platformAdminClubListHref(
      new URLSearchParams(
        "search=alpha&lifecycle=ACTIVE&visibility=PRIVATE&domainStatus=ACTION_REQUIRED&onboardingState=MISSING&cursor=private-cursor&onboarding=1&focusId=c-1&scrollTop=240",
      ),
    );

    expect(href).toBe(
      "/admin/clubs?search=alpha&lifecycle=ACTIVE&visibility=PRIVATE&domainStatus=ACTION_REQUIRED&onboardingState=MISSING",
    );
    expect(href).not.toContain("cursor=");
    expect(href).not.toContain("onboarding=");
    expect(href).not.toContain("focusId=");
    expect(href).not.toContain("scrollTop=");
  });

  it("falls back to the clubs list when no filters remain", () => {
    expect(
      platformAdminClubListHref(
        new URLSearchParams("cursor=private-cursor&onboarding=1&lifecycle=DROP"),
      ),
    ).toBe("/admin/clubs");
  });
});

describe("platformAdminClubListSearchParamsFromFilters", () => {
  it("omits empty and unknown filter fields from the serialized search", () => {
    const params = platformAdminClubListSearchParamsFromFilters({
      search: "alpha",
      lifecycle: "ACTIVE",
      limit: 25,
      cursor: "private-cursor",
    });

    expect(params.toString()).toBe("search=alpha&lifecycle=ACTIVE");
  });
});
