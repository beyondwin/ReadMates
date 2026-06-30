import { describe, expect, it } from "vitest";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import {
  adminOtherAccountLoginPath,
  adminWorkspaceAccountLabel,
  deriveAdminWorkspaceDestinations,
} from "./admin-workspace-switcher-model";

const baseAuth: AuthMeResponse = {
  authenticated: true,
  userId: "platform-user-1",
  membershipId: null,
  clubId: null,
  email: "operator@example.com",
  displayName: "운영자",
  accountName: "운영자 계정",
  role: null,
  membershipStatus: null,
  approvalState: "INACTIVE",
  currentMembership: null,
  joinedClubs: [],
  platformAdmin: { userId: "platform-user-1", email: "operator@example.com", role: "OWNER" },
  recommendedAppEntryUrl: "/admin",
};

describe("admin workspace switcher model", () => {
  it("creates host and member destinations for active host clubs", () => {
    const destinations = deriveAdminWorkspaceDestinations({
      ...baseAuth,
      joinedClubs: [
        {
          clubId: "club-host",
          clubSlug: "reading-sai",
          clubName: "읽는사이",
          membershipId: "membership-host",
          role: "HOST",
          status: "ACTIVE",
          primaryHost: null,
        },
      ],
    });

    expect(destinations).toEqual([
      {
        id: "membership-host:host",
        clubName: "읽는사이",
        clubSlug: "reading-sai",
        role: "HOST",
        status: "ACTIVE",
        label: "호스트 공간",
        href: "/clubs/reading-sai/app/host",
        priority: "primary",
      },
      {
        id: "membership-host:member",
        clubName: "읽는사이",
        clubSlug: "reading-sai",
        role: "HOST",
        status: "ACTIVE",
        label: "멤버 공간",
        href: "/clubs/reading-sai/app",
        priority: "secondary",
      },
    ]);
  });

  it("creates member destinations for readable non-host memberships", () => {
    const destinations = deriveAdminWorkspaceDestinations({
      ...baseAuth,
      joinedClubs: [
        {
          clubId: "club-member",
          clubSlug: "paper-room",
          clubName: "종이방",
          membershipId: "membership-member",
          role: "MEMBER",
          status: "SUSPENDED",
          primaryHost: "host@example.com",
        },
        {
          clubId: "club-viewer",
          clubSlug: "viewer-room",
          clubName: "둘러보기",
          membershipId: "membership-viewer",
          role: "MEMBER",
          status: "VIEWER",
          primaryHost: null,
        },
      ],
    });

    expect(destinations.map((item) => [item.id, item.href, item.label])).toEqual([
      ["membership-member:member", "/clubs/paper-room/app", "멤버 공간"],
      ["membership-viewer:member", "/clubs/viewer-room/app", "멤버 공간"],
    ]);
  });

  it("excludes memberships that cannot open a workspace", () => {
    const destinations = deriveAdminWorkspaceDestinations({
      ...baseAuth,
      joinedClubs: [
        {
          clubId: "club-invited",
          clubSlug: "invited-room",
          clubName: "초대 대기",
          membershipId: "membership-invited",
          role: "MEMBER",
          status: "INVITED",
          primaryHost: null,
        },
        {
          clubId: "club-left",
          clubSlug: "left-room",
          clubName: "떠난 클럽",
          membershipId: "membership-left",
          role: "HOST",
          status: "LEFT",
          primaryHost: null,
        },
      ],
    });

    expect(destinations).toEqual([]);
  });

  it("uses public-safe account labels and safe admin return paths", () => {
    expect(adminWorkspaceAccountLabel(baseAuth)).toBe("운영자 계정");
    expect(adminWorkspaceAccountLabel({ ...baseAuth, accountName: null, displayName: null })).toBe(
      "operator@example.com",
    );
    expect(adminWorkspaceAccountLabel(null)).toBe("현재 계정");
    expect(adminOtherAccountLoginPath("/admin/clubs", "?filter=ready", "#top")).toBe(
      "/login?returnTo=%2Fadmin%2Fclubs%3Ffilter%3Dready%23top",
    );
    expect(adminOtherAccountLoginPath("/clubs/reading-sai/app", "", "")).toBe("/login?returnTo=%2Fadmin");
  });
});
