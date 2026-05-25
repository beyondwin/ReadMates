import type { PlatformAdminRole } from "@/features/platform-admin/model/platform-admin-domain-types";

export type AdminCapability =
  | "view_today"
  | "view_clubs"
  | "view_club_detail"
  | "view_ai_ops"
  | "view_support"
  | "view_health"
  | "view_notifications"
  | "view_audit"
  | "view_analytics"
  | "create_club"
  | "edit_club_metadata"
  | "toggle_club_visibility"
  | "create_support_grant"
  | "revoke_support_grant"
  | "force_cancel_ai_job"
  | "check_domain_provisioning";

const ALL_VIEWS: readonly AdminCapability[] = [
  "view_today",
  "view_clubs",
  "view_club_detail",
  "view_ai_ops",
  "view_support",
  "view_health",
  "view_notifications",
  "view_audit",
  "view_analytics",
];

const OWNER_CAPS: ReadonlySet<AdminCapability> = new Set<AdminCapability>([
  ...ALL_VIEWS,
  "create_club",
  "edit_club_metadata",
  "toggle_club_visibility",
  "create_support_grant",
  "revoke_support_grant",
  "force_cancel_ai_job",
  "check_domain_provisioning",
]);

const OPERATOR_CAPS: ReadonlySet<AdminCapability> = new Set<AdminCapability>([
  ...ALL_VIEWS,
  "create_club",
  "edit_club_metadata",
  "toggle_club_visibility",
  "force_cancel_ai_job",
  "check_domain_provisioning",
]);

const SUPPORT_CAPS: ReadonlySet<AdminCapability> = new Set<AdminCapability>(ALL_VIEWS);

export const ADMIN_CAPABILITY_MATRIX: Record<PlatformAdminRole, ReadonlySet<AdminCapability>> = {
  OWNER: OWNER_CAPS,
  OPERATOR: OPERATOR_CAPS,
  SUPPORT: SUPPORT_CAPS,
};

export function canDo(role: PlatformAdminRole, capability: AdminCapability): boolean {
  return ADMIN_CAPABILITY_MATRIX[role].has(capability);
}
