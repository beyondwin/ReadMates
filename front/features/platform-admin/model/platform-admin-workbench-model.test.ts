import { describe, expect, it } from "vitest";
import {
  buildPlatformAdminWorkbench,
  type PlatformAdminWorkbenchInput,
} from "@/features/platform-admin/model/platform-admin-workbench-model";

const baseInput: PlatformAdminWorkbenchInput = {
  role: "OWNER",
  activeClubCount: 3,
  domainActionRequiredCount: 1,
  selectedClubId: null,
  clubs: [
    {
      clubId: "club-ready",
      slug: "ready-club",
      name: "Ready Club",
      tagline: "함께 읽는 클럽",
      about: "공개 소개가 입력되어 있습니다.",
      status: "ACTIVE",
      publicVisibility: "PRIVATE",
      domainCount: 0,
      domainActionRequiredCount: 0,
      firstHostOnboardingState: "ASSIGNED",
    },
    {
      clubId: "club-host-missing",
      slug: "host-missing",
      name: "Host Missing",
      tagline: "준비 중",
      about: "공개 소개가 입력되어 있습니다.",
      status: "SETUP_REQUIRED",
      publicVisibility: "PRIVATE",
      domainCount: 0,
      domainActionRequiredCount: 0,
      firstHostOnboardingState: "MISSING",
    },
    {
      clubId: "club-public",
      slug: "public-club",
      name: "Public Club",
      tagline: "공개 클럽",
      about: "이미 공개된 클럽입니다.",
      status: "ACTIVE",
      publicVisibility: "PUBLIC",
      domainCount: 1,
      domainActionRequiredCount: 1,
      firstHostOnboardingState: "ASSIGNED",
    },
  ],
  domains: [
    {
      id: "domain-public",
      clubId: "club-public",
      hostname: "public.example.com",
      kind: "SUBDOMAIN",
      status: "FAILED",
      desiredState: "ENABLED",
      manualAction: "NONE",
      errorCode: "DNS_NOT_CONNECTED",
      isPrimary: false,
      verifiedAt: null,
      lastCheckedAt: null,
    },
  ],
};

describe("platform admin workbench model", () => {
  it("orders blocked clubs before ready and stable clubs", () => {
    const workbench = buildPlatformAdminWorkbench(baseInput);

    expect(workbench.queueItems.map((item) => item.clubId)).toEqual([
      "club-host-missing",
      "club-public",
      "club-ready",
    ]);
    expect(workbench.selectedClub?.clubId).toBe("club-host-missing");
  });

  it("builds publish checklist and primary action for a ready private club", () => {
    const workbench = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedClubId: "club-ready",
    });

    expect(workbench.selectedClub?.publishChecklist.every((item) => item.passed)).toBe(true);
    expect(workbench.selectedClub?.primaryAction).toEqual({
      kind: "make-public",
      label: "공개 전환",
      disabled: false,
      reason: null,
    });
  });

  it("blocks publish when the first host is missing", () => {
    const workbench = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedClubId: "club-host-missing",
    });

    expect(workbench.selectedClub?.publishChecklist).toContainEqual({
      id: "first-host",
      label: "첫 호스트 지정",
      passed: false,
      detail: "첫 호스트가 아직 없습니다.",
    });
    expect(workbench.selectedClub?.primaryAction.disabled).toBe(true);
  });

  it("exposes role capabilities separately from queue state", () => {
    const owner = buildPlatformAdminWorkbench(baseInput);
    const support = buildPlatformAdminWorkbench({ ...baseInput, role: "SUPPORT" });

    expect(owner.permissions.canCreateSupportGrant).toBe(true);
    expect(support.permissions.canCreateSupportGrant).toBe(false);
    expect(support.permissions.canUpdateClub).toBe(false);
  });

  it("returns the 'none' primary action for ARCHIVED and SUSPENDED clubs", () => {
    const archived = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedClubId: "club-archived",
      clubs: [
        ...baseInput.clubs,
        {
          clubId: "club-archived",
          slug: "archived-club",
          name: "보관 클럽",
          tagline: "tagline",
          about: "about",
          status: "ARCHIVED",
          publicVisibility: "PRIVATE",
          domainCount: 0,
          domainActionRequiredCount: 0,
          firstHostOnboardingState: "ASSIGNED",
        },
      ],
    });

    expect(archived.selectedClub?.primaryAction.kind).toBe("none");
    expect(archived.selectedClub?.primaryAction.disabled).toBe(true);
  });

  it("picks the first queue item when selectedClubId is null", () => {
    const workbench = buildPlatformAdminWorkbench({ ...baseInput, selectedClubId: null });
    expect(workbench.selectedClub?.clubId).toBe("club-host-missing");
  });
});
