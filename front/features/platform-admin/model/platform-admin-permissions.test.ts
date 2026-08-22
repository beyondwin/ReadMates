import { describe, expect, it } from "vitest";
import { canAdmin, canDo, type AdminCapability } from "./platform-admin-permissions";
import type { PlatformAdminCapabilities } from "./platform-admin-capabilities";

describe("canDo", () => {
  const allViews: AdminCapability[] = [
    "view_today", "view_clubs", "view_club_detail",
    "view_ai_ops", "view_support", "view_health",
    "view_notifications", "view_audit", "view_analytics",
  ];

  it.each(["OWNER", "OPERATOR", "SUPPORT"] as const)("allows every view_* for %s", (role) => {
    for (const capability of allViews) {
      expect(canDo(role, capability)).toBe(true);
    }
  });

  it("OWNER can perform every mutating capability", () => {
    expect(canDo("OWNER", "create_club")).toBe(true);
    expect(canDo("OWNER", "edit_club_metadata")).toBe(true);
    expect(canDo("OWNER", "toggle_club_visibility")).toBe(true);
    expect(canDo("OWNER", "create_support_grant")).toBe(true);
    expect(canDo("OWNER", "revoke_support_grant")).toBe(true);
    expect(canDo("OWNER", "force_cancel_ai_job")).toBe(true);
    expect(canDo("OWNER", "check_domain_provisioning")).toBe(true);
  });

  it("OPERATOR can act on clubs and AI but not support grants", () => {
    expect(canDo("OPERATOR", "create_club")).toBe(true);
    expect(canDo("OPERATOR", "edit_club_metadata")).toBe(true);
    expect(canDo("OPERATOR", "toggle_club_visibility")).toBe(true);
    expect(canDo("OPERATOR", "force_cancel_ai_job")).toBe(true);
    expect(canDo("OPERATOR", "check_domain_provisioning")).toBe(true);
    expect(canDo("OPERATOR", "create_support_grant")).toBe(false);
    expect(canDo("OPERATOR", "revoke_support_grant")).toBe(false);
  });

  it("SUPPORT can only view, never mutate", () => {
    expect(canDo("SUPPORT", "create_club")).toBe(false);
    expect(canDo("SUPPORT", "edit_club_metadata")).toBe(false);
    expect(canDo("SUPPORT", "toggle_club_visibility")).toBe(false);
    expect(canDo("SUPPORT", "create_support_grant")).toBe(false);
    expect(canDo("SUPPORT", "revoke_support_grant")).toBe(false);
    expect(canDo("SUPPORT", "force_cancel_ai_job")).toBe(false);
    expect(canDo("SUPPORT", "check_domain_provisioning")).toBe(false);
  });
});

describe("canAdmin", () => {
  const projection = (role: PlatformAdminCapabilities["role"], capabilities: PlatformAdminCapabilities["capabilities"]): PlatformAdminCapabilities => ({
    schemaVersion: 1,
    role,
    status: "ACTIVE",
    capabilities,
    generatedAt: "2026-08-22T00:00:00Z",
  });

  it("is a membership check on the returned capabilities list", () => {
    expect(canAdmin(projection("OWNER", ["VIEW_TODAY", "VIEW_CLUBS"]), "CREATE_CLUB")).toBe(false);
    expect(canAdmin(projection("SUPPORT", ["VIEW_TODAY", "CREATE_CLUB"]), "CREATE_CLUB")).toBe(true);
  });

  it("never infers an allowlist from role", () => {
    const ownerWithoutMutations = projection("OWNER", ["VIEW_TODAY"]);
    const supportWithManage = projection("SUPPORT", ["MANAGE_PLATFORM_ADMINS"]);

    expect(canAdmin(ownerWithoutMutations, "MANAGE_PLATFORM_ADMINS")).toBe(false);
    expect(canAdmin(supportWithManage, "MANAGE_PLATFORM_ADMINS")).toBe(true);
    expect(canAdmin(supportWithManage, "VIEW_TODAY")).toBe(false);
  });
});
