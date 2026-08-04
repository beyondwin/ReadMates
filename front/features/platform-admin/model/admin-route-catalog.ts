import type { AdminCapability } from "@/features/platform-admin/model/platform-admin-permissions";

export type AdminRouteGroup = "command" | "operations" | "review";
export type AdminRouteStatus = "ready" | "coming_soon";
export type AdminRouteSlice =
  | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10";

export type AdminRouteDescriptor = {
  path: string;
  label: string;
  group: AdminRouteGroup;
  groupLabel: string;
  slice: AdminRouteSlice;
  status: AdminRouteStatus;
  requiredCapability: AdminCapability;
  comingSoon?: {
    title: string;
    summary: string;
    bullets: ReadonlyArray<string>;
    docHref: string;
  };
};

export const ADMIN_ROUTES: ReadonlyArray<AdminRouteDescriptor> = [
  {
    path: "today",
    label: "오늘",
    group: "command",
    groupLabel: "Command",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_today",
  },
  {
    path: "clubs",
    label: "클럽",
    group: "command",
    groupLabel: "Command",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_clubs",
  },
  {
    path: "health",
    label: "사건",
    group: "operations",
    groupLabel: "Operations",
    slice: "S2",
    status: "ready",
    requiredCapability: "view_health",
  },
  {
    path: "notifications",
    label: "알림",
    group: "operations",
    groupLabel: "Operations",
    slice: "S5",
    status: "ready",
    requiredCapability: "view_notifications",
  },
  {
    path: "ai-ops",
    label: "AI 작업",
    group: "operations",
    groupLabel: "Operations",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_ai_ops",
  },
  {
    path: "support",
    label: "지원",
    group: "operations",
    groupLabel: "Operations",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_support",
  },
  {
    path: "audit",
    label: "감사",
    group: "review",
    groupLabel: "Review",
    slice: "S7",
    status: "ready",
    requiredCapability: "view_audit",
  },
  {
    path: "analytics",
    label: "분석",
    group: "review",
    groupLabel: "Review",
    slice: "S8",
    status: "ready",
    requiredCapability: "view_analytics",
  },
];

export const ADMIN_CLUB_DETAIL_ROUTE: AdminRouteDescriptor = {
  path: "clubs/:clubId",
  label: "클럽 상세",
  group: "command",
  groupLabel: "Command",
  slice: "S1",
  status: "ready",
  requiredCapability: "view_club_detail",
};
