import { describe, expect, it } from "vitest";
import type {
  PlatformAdminClub,
  PlatformAdminClubListResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/model/platform-admin-domain-types";
import { deriveStripMetrics } from "./admin-status-strip-model";

function club(overrides: Partial<PlatformAdminClub>): PlatformAdminClub {
  return {
    clubId: "club-1",
    slug: "c",
    name: "name",
    tagline: "",
    about: "",
    status: "ACTIVE",
    publicVisibility: "PRIVATE",
    domainCount: 0,
    domainActionRequiredCount: 0,
    firstHostOnboardingState: "ASSIGNED",
    ...overrides,
  };
}

const summary: PlatformAdminSummaryResponse = {
  platformRole: "OWNER",
  activeClubCount: 0,
  domainActionRequiredCount: 3,
  domainsRequiringAction: [],
};

describe("deriveStripMetrics", () => {
  it("counts SETUP_REQUIRED clubs as 조치 필요", () => {
    const clubs: PlatformAdminClubListResponse = {
      items: [
        club({ clubId: "a", status: "SETUP_REQUIRED" }),
        club({ clubId: "b", status: "ACTIVE" }),
        club({ clubId: "c", status: "SETUP_REQUIRED" }),
      ],
    };
    const metrics = deriveStripMetrics(summary, clubs);
    expect(metrics.setupRequiredCount).toBe(2);
  });

  it("counts PRIVATE + ready-to-publish clubs as 공개 준비", () => {
    const clubs: PlatformAdminClubListResponse = {
      items: [
        club({ clubId: "a", status: "ACTIVE", publicVisibility: "PRIVATE", firstHostOnboardingState: "ASSIGNED" }),
        club({ clubId: "b", status: "ACTIVE", publicVisibility: "PRIVATE", firstHostOnboardingState: "ASSIGNED", domainActionRequiredCount: 1 }),
        club({ clubId: "c", status: "ACTIVE", publicVisibility: "PUBLIC", firstHostOnboardingState: "ASSIGNED" }),
        club({ clubId: "d", status: "ACTIVE", publicVisibility: "PRIVATE", firstHostOnboardingState: "MISSING" }),
        club({ clubId: "e", status: "SETUP_REQUIRED", publicVisibility: "PRIVATE", firstHostOnboardingState: "ASSIGNED" }),
      ],
    };
    const metrics = deriveStripMetrics(summary, clubs);
    expect(metrics.readyToPublishCount).toBe(1);
  });

  it("passes summary fields through unchanged", () => {
    const metrics = deriveStripMetrics(summary, { items: [] });
    expect(metrics.platformRole).toBe("OWNER");
    expect(metrics.domainActionRequiredCount).toBe(3);
  });
});
