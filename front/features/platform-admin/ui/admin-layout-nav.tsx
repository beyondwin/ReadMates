import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import type { PlatformAdminRole } from "@/features/platform-admin/model/platform-admin-domain-types";
import { canDo } from "@/features/platform-admin/model/platform-admin-permissions";
import {
  ADMIN_ROUTES,
  type AdminRouteDescriptor,
  type AdminRouteGroup,
} from "@/features/platform-admin/model/admin-route-catalog";

export function AdminLayoutNav({
  role,
  ariaLabel = "플랫폼 관리 메뉴",
}: {
  role: PlatformAdminRole;
  ariaLabel?: string;
}) {
  const location = useLocation();
  const groups = useMemo(() => groupRoutes(ADMIN_ROUTES, role), [role]);
  const currentPath = location.pathname;

  return (
    <nav className="admin-layout-nav" aria-label={ariaLabel}>
      {groups.map((group) => (
        <section key={group.id} className="admin-layout-nav__group">
          <header className="admin-layout-nav__group-header">{group.label}</header>
          <ul className="admin-layout-nav__items">
            {group.routes.map((route) => (
              <li key={route.path}>
                <NavItem route={route} isActive={isRouteActive(currentPath, route.path)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function NavItem({ route, isActive }: { route: AdminRouteDescriptor; isActive: boolean }) {
  return (
    <Link
      to={`/admin/${route.path}`}
      className={"admin-layout-nav__item" + (isActive ? " admin-layout-nav__item--active" : "")}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="admin-layout-nav__item-label">{route.label}</span>
      {route.status === "coming_soon" ? (
        <span className="admin-layout-nav__pill">준비 중 · {route.slice}</span>
      ) : null}
    </Link>
  );
}

type GroupBucket = { id: AdminRouteGroup; label: string; routes: AdminRouteDescriptor[] };

function groupRoutes(
  routes: ReadonlyArray<AdminRouteDescriptor>,
  role: PlatformAdminRole,
): GroupBucket[] {
  const visible = routes.filter((route) => canDo(role, route.requiredCapability));
  const buckets = new Map<AdminRouteGroup, GroupBucket>();
  for (const route of visible) {
    const existing = buckets.get(route.group);
    if (existing) {
      existing.routes.push(route);
    } else {
      buckets.set(route.group, { id: route.group, label: route.groupLabel, routes: [route] });
    }
  }
  return [...buckets.values()];
}

function isRouteActive(pathname: string, routePath: string): boolean {
  return pathname === `/admin/${routePath}` || pathname.startsWith(`/admin/${routePath}/`);
}
