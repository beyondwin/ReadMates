import {
  canAdmin,
  type PlatformAdminCapabilities,
  type PlatformAdminCapability,
} from "@/features/platform-admin/model/platform-admin-capabilities";

export type AdminRouteGroup = "today" | "clubs" | "services" | "review";
export type AdminRouteStatus = "ready" | "coming_soon";
export type AdminRouteSlice =
  | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10";

export const ADMIN_SHELL_LAYOUT_BREAKPOINT_PX = 768;
export const ADMIN_SHELL_LAYOUT_MEDIA_QUERY = `(max-width: ${ADMIN_SHELL_LAYOUT_BREAKPOINT_PX}px)`;

export type AdminRouteDescriptor = {
  path: string;
  label: string;
  group: AdminRouteGroup;
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
  href?: string;
  children: ReadonlyArray<AdminRouteDescriptor>;
};

const PRIMARY_AREAS: ReadonlyArray<Pick<AdminNavArea, "id" | "label" | "href">> = [
  { id: "today", label: "오늘", href: "/admin/today" },
  { id: "clubs", label: "클럽", href: "/admin/clubs" },
  { id: "services", label: "서비스" },
  { id: "review", label: "검토" },
];

export const ADMIN_ROUTES: ReadonlyArray<AdminRouteDescriptor> = [
  {
    path: "today",
    label: "오늘",
    group: "today",
    groupLabel: "오늘",
    slice: "S1",
    status: "ready",
    requiredCapability: "VIEW_TODAY",
  },
  {
    path: "clubs",
    label: "클럽",
    group: "clubs",
    groupLabel: "클럽",
    slice: "S1",
    status: "ready",
    requiredCapability: "VIEW_CLUBS",
  },
  {
    path: "health",
    label: "서비스 건강",
    group: "services",
    groupLabel: "서비스",
    slice: "S2",
    status: "ready",
    requiredCapability: "VIEW_SERVICE_HEALTH",
  },
  {
    path: "notifications",
    label: "알림",
    group: "services",
    groupLabel: "서비스",
    slice: "S5",
    status: "ready",
    requiredCapability: "VIEW_NOTIFICATION_OPERATIONS",
  },
  {
    path: "ai-ops",
    label: "AI 작업",
    group: "services",
    groupLabel: "서비스",
    slice: "S1",
    status: "ready",
    requiredCapability: "VIEW_AI_OPERATIONS",
  },
  {
    path: "support",
    label: "지원",
    group: "review",
    groupLabel: "검토",
    slice: "S1",
    status: "ready",
    requiredCapability: "VIEW_SUPPORT",
  },
  {
    path: "audit",
    label: "감사",
    group: "review",
    groupLabel: "검토",
    slice: "S7",
    status: "ready",
    requiredCapability: "VIEW_AUDIT",
  },
  {
    path: "analytics",
    label: "분석",
    group: "review",
    groupLabel: "검토",
    slice: "S8",
    status: "ready",
    requiredCapability: "VIEW_ANALYTICS",
  },
];

export const ADMIN_CLUB_DETAIL_ROUTE: AdminRouteDescriptor = {
  path: "clubs/:clubId",
  label: "클럽 상세",
  group: "clubs",
  groupLabel: "클럽",
  slice: "S1",
  status: "ready",
  requiredCapability: "VIEW_CLUB_OPERATIONS",
};

export function visibleAdminNav(
  capabilities: PlatformAdminCapabilities | null | undefined,
): AdminNavArea[] {
  if (capabilities == null) {
    return [];
  }

  const areas: AdminNavArea[] = [];
  for (const area of PRIMARY_AREAS) {
    const routes = ADMIN_ROUTES.filter(
      (route) => route.group === area.id && canAdmin(capabilities, route.requiredCapability),
    );
    if (area.href) {
      if (!routes.some((route) => `/admin/${route.path}` === area.href)) {
        continue;
      }
      areas.push({ ...area, children: [] });
      continue;
    }
    if (routes.length === 0) {
      continue;
    }
    areas.push({ ...area, children: routes });
  }
  return areas;
}

export function isAdminAreaActive(pathname: string, area: AdminNavArea): boolean {
  if (area.href) {
    return pathname === area.href || pathname.startsWith(`${area.href}/`);
  }
  return area.children.some((route) => isAdminRouteActive(pathname, route.path));
}

export function isAdminRouteActive(pathname: string, routePath: string): boolean {
  return pathname === `/admin/${routePath}` || pathname.startsWith(`/admin/${routePath}/`);
}
