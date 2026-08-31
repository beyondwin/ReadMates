import {
  canAdmin,
  type PlatformAdminCapabilities,
  type PlatformAdminCapability,
} from "@/features/platform-admin/model/platform-admin-capabilities";
import { adminNavigationLanguage } from "@/features/platform-admin/model/admin-status-language";

export type AdminRouteGroup = "today" | "clubs" | "service" | "records";
export type AdminRouteOwner = AdminRouteGroup | "emergency";
export type AdminRouteStatus = "ready" | "coming_soon";
export type AdminRouteSlice =
  | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10" | "C4";

export const ADMIN_SHELL_LAYOUT_BREAKPOINT_PX = 768;
export const ADMIN_SHELL_LAYOUT_MEDIA_QUERY = `(max-width: ${ADMIN_SHELL_LAYOUT_BREAKPOINT_PX}px)`;

export type AdminRouteDescriptor = {
  path: string;
  label: string;
  group: AdminRouteGroup | null;
  groupLabel: string;
  slice: AdminRouteSlice;
  status: AdminRouteStatus;
  requiredCapability: PlatformAdminCapability;
  comingSoon?: {
    title: string;
    summary: string;
    bullets: ReadonlyArray<string>;
    docHref: string;
  };
};

export type AdminNavArea = {
  id: AdminRouteGroup;
  label: string;
  href: string;
  children: ReadonlyArray<AdminRouteDescriptor>;
};

export type VisibleAdminNav = {
  areas: AdminNavArea[];
  pinned: AdminRouteDescriptor[];
};

type AdminPrimaryAreaDefinition = Pick<AdminNavArea, "id" | "label"> & {
  canonicalPath: string;
};

const PRIMARY_AREAS: ReadonlyArray<AdminPrimaryAreaDefinition> = [
  { id: "today", label: adminNavigationLanguage("today").primaryText, canonicalPath: "today" },
  { id: "clubs", label: adminNavigationLanguage("clubs").primaryText, canonicalPath: "clubs" },
  { id: "service", label: adminNavigationLanguage("service").primaryText, canonicalPath: "health" },
  { id: "records", label: adminNavigationLanguage("records").primaryText, canonicalPath: "audit" },
];

export const ADMIN_ROUTES: ReadonlyArray<AdminRouteDescriptor> = [
  {
    path: "today",
    label: "오늘",
    group: "today",
    groupLabel: adminNavigationLanguage("today").primaryText,
    slice: "S1",
    status: "ready",
    requiredCapability: "VIEW_TODAY",
  },
  {
    path: "clubs",
    label: "클럽",
    group: "clubs",
    groupLabel: adminNavigationLanguage("clubs").primaryText,
    slice: "S1",
    status: "ready",
    requiredCapability: "VIEW_CLUBS",
  },
  {
    path: "notifications",
    label: "알림 전달",
    group: "service",
    groupLabel: adminNavigationLanguage("service").primaryText,
    slice: "S5",
    status: "ready",
    requiredCapability: "VIEW_NOTIFICATION_OPERATIONS",
  },
  {
    path: "ai-ops",
    label: "AI 작업",
    group: "service",
    groupLabel: adminNavigationLanguage("service").primaryText,
    slice: "S1",
    status: "ready",
    requiredCapability: "VIEW_AI_OPERATIONS",
  },
  {
    path: "health",
    label: "서비스 상태",
    group: "service",
    groupLabel: adminNavigationLanguage("service").primaryText,
    slice: "S2",
    status: "ready",
    requiredCapability: "VIEW_SERVICE_HEALTH",
  },
  {
    path: "audit",
    label: "처리 기록",
    group: "records",
    groupLabel: adminNavigationLanguage("records").primaryText,
    slice: "S7",
    status: "ready",
    requiredCapability: "VIEW_AUDIT",
  },
  {
    path: "support",
    label: "지원 접근",
    group: "clubs",
    groupLabel: adminNavigationLanguage("clubs").primaryText,
    slice: "S1",
    status: "ready",
    requiredCapability: "VIEW_SUPPORT",
  },
  {
    path: "analytics",
    label: "분석 부록",
    group: "records",
    groupLabel: adminNavigationLanguage("records").primaryText,
    slice: "S8",
    status: "ready",
    requiredCapability: "VIEW_ANALYTICS",
  },
  {
    path: "public-takedown",
    label: "긴급 공개 회수",
    group: null,
    groupLabel: "비상 레인",
    slice: "C4",
    status: "ready",
    requiredCapability: "EMERGENCY_PUBLIC_TAKEDOWN",
  },
];

export const ADMIN_CLUB_DETAIL_ROUTE: AdminRouteDescriptor = {
  path: "clubs/:clubId",
  label: "클럽 상세",
  group: "clubs",
  groupLabel: adminNavigationLanguage("clubs").primaryText,
  slice: "S1",
  status: "ready",
  requiredCapability: "VIEW_CLUB_OPERATIONS",
};

export function visibleAdminNav(
  capabilities: PlatformAdminCapabilities | null | undefined,
): VisibleAdminNav {
  if (capabilities == null) {
    return { areas: [], pinned: [] };
  }

  const areas: AdminNavArea[] = [];
  for (const area of PRIMARY_AREAS) {
    const routes = ADMIN_ROUTES.filter(
      (route) => route.group === area.id && canAdmin(capabilities, route.requiredCapability),
    );
    if (routes.length === 0) continue;
    const destination = routes.find((route) => route.path === area.canonicalPath) ?? routes[0];
    areas.push({
      id: area.id,
      label: area.label,
      href: `/admin/${destination.path}`,
      children: routes,
    });
  }

  const pinned = ADMIN_ROUTES.filter(
    (route) => route.group == null && canAdmin(capabilities, route.requiredCapability),
  );
  return { areas, pinned };
}

export function resolveAdminRouteOwner(location: {
  pathname: string;
  search?: string;
}): AdminRouteOwner | null {
  const pathname = location.pathname.length > 1
    ? location.pathname.replace(/\/+$/, "")
    : location.pathname;
  if (pathname === "/admin" || pathname === "/admin/today") return "today";
  if (pathname.startsWith("/admin/clubs/")) return "clubs";
  if (pathname === "/admin/public-takedown") return "emergency";
  return ADMIN_ROUTES.find((route) => `/admin/${route.path}` === pathname)?.group ?? null;
}
