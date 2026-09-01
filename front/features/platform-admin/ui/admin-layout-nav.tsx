import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ADMIN_SHELL_LAYOUT_MEDIA_QUERY,
  visibleAdminNav,
  type AdminRouteOwner,
  type AdminRouteDescriptor,
} from "@/features/platform-admin/model/admin-route-catalog";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";

export type AdminNavigationLinkRenderProps = {
  href: string;
  className: string;
  ariaCurrent?: "page";
  ariaLabel?: string;
  style?: CSSProperties;
  children: ReactNode;
};

export type AdminNavigationLinkRenderer = (
  props: AdminNavigationLinkRenderProps,
) => ReactNode;

export function AdminLayoutNav({
  capabilities,
  currentOwner,
  renderLink,
  ariaLabel = "플랫폼 관리 메뉴",
  todayCount = null,
  onLogout,
}: {
  capabilities: PlatformAdminCapabilities | null | undefined;
  currentOwner: AdminRouteOwner | null;
  renderLink: AdminNavigationLinkRenderer;
  ariaLabel?: string;
  todayCount?: number | null;
  onLogout?: () => void;
}) {
  const compact = useAdminShellCompactLayout();
  const { areas, pinned } = useMemo(() => visibleAdminNav(capabilities), [capabilities]);

  if (compact) return null;

  return (
    <nav
      className="admin-layout-nav"
      aria-label={ariaLabel}
      data-layout={compact ? "compact" : "wide"}
    >
      <p className="admin-layout-nav__eyebrow">운영</p>
      {areas.length > 0 ? (
        <ul className="admin-layout-nav__areas">
          {areas.map((area) => {
            const areaActive = currentOwner === area.id;
            return (
              <li key={area.id}>
                {renderLink({
                  href: area.href,
                  className:
                    "admin-layout-nav__item" + (areaActive ? " admin-layout-nav__item--active" : ""),
                  ariaCurrent: areaActive ? "page" : undefined,
                  children: (
                    <>
                      <span className="admin-layout-nav__item-label">{area.label}</span>
                      {area.id === "today" && todayCount != null && todayCount > 0 ? (
                        <span className="admin-layout-nav__count ledger-number" aria-hidden="true">
                          {todayCount}
                        </span>
                      ) : null}
                    </>
                  ),
                })}
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
                isActive={currentOwner === "emergency"}
                renderLink={renderLink}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {onLogout ? (
        <button type="button" className="admin-layout-nav__logout" aria-label="다른 계정으로 로그인" onClick={onLogout} />
      ) : (
        <span className="admin-layout-nav__logout" aria-hidden="true" />
      )}
    </nav>
  );
}

function NavItem({
  route,
  isActive,
  renderLink,
}: {
  route: AdminRouteDescriptor;
  isActive: boolean;
  renderLink: AdminNavigationLinkRenderer;
}) {
  return renderLink({
    href: `/admin/${route.path}`,
    className: "admin-layout-nav__item" + (isActive ? " admin-layout-nav__item--active" : ""),
    ariaCurrent: isActive ? "page" : undefined,
    children: (
      <>
        <span className="admin-layout-nav__item-label">{route.label}</span>
        {route.status === "coming_soon" ? (
          <span className="admin-layout-nav__pill">준비 중 · {route.slice}</span>
        ) : null}
      </>
    ),
  });
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
