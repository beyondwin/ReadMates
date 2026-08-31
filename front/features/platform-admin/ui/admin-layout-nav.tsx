import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  ADMIN_SHELL_LAYOUT_MEDIA_QUERY,
  isAdminAreaActive,
  isAdminRouteActive,
  visibleAdminNav,
  type AdminRouteDescriptor,
} from "@/features/platform-admin/model/admin-route-catalog";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";

export function AdminLayoutNav({
  capabilities,
  ariaLabel = "플랫폼 관리 메뉴",
  todayCount = null,
}: {
  capabilities: PlatformAdminCapabilities | null | undefined;
  ariaLabel?: string;
  todayCount?: number | null;
}) {
  const location = useLocation();
  const compact = useAdminShellCompactLayout();
  const { areas, pinned } = useMemo(() => visibleAdminNav(capabilities), [capabilities]);

  if (compact) return null;

  return (
    <nav
      className="admin-layout-nav"
      aria-label={ariaLabel}
      data-layout={compact ? "compact" : "wide"}
    >
      {areas.length > 0 ? (
        <ul className="admin-layout-nav__areas">
          {areas.map((area) => {
            const areaActive = isAdminAreaActive(location, area);
            return (
              <li key={area.id}>
                <Link
                  to={area.href}
                  className={
                    "admin-layout-nav__item" + (areaActive ? " admin-layout-nav__item--active" : "")
                  }
                  aria-current={areaActive ? "page" : undefined}
                >
                  <span className="admin-layout-nav__item-label">{area.label}</span>
                  {area.id === "today" && todayCount != null && todayCount > 0 ? (
                    <span className="admin-layout-nav__count ledger-number" aria-hidden="true">
                      {todayCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {pinned.length > 0 ? (
        <ul className="admin-layout-nav__pinned">
          {pinned.map((route) => (
            <li key={route.path}>
              <NavItem
                route={route}
                isActive={isAdminRouteActive(location.pathname, route.path)}
              />
            </li>
          ))}
        </ul>
      ) : null}
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

export function AdminShellCompactSlot({ children }: { children: ReactNode }) {
  return useAdminShellCompactLayout() ? children : null;
}

function useAdminShellCompactLayout(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(ADMIN_SHELL_LAYOUT_MEDIA_QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(ADMIN_SHELL_LAYOUT_MEDIA_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return compact;
}
