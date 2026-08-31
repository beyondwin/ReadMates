import { useMemo } from "react";
import { Link, useLocation } from "react-router";
import {
  isAdminAreaActive,
  visibleAdminNav,
} from "@/features/platform-admin/model/admin-route-catalog";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import { AdminShellCompactSlot } from "./admin-layout-nav";

export function AdminMobileNavigation({
  capabilities,
  ariaLabel = "플랫폼 관리 모바일 메뉴",
}: {
  capabilities: PlatformAdminCapabilities | null | undefined;
  ariaLabel?: string;
}) {
  return (
    <AdminShellCompactSlot>
      <AdminMobileNavigationContent capabilities={capabilities} ariaLabel={ariaLabel} />
    </AdminShellCompactSlot>
  );
}

function AdminMobileNavigationContent({
  capabilities,
  ariaLabel,
}: {
  capabilities: PlatformAdminCapabilities | null | undefined;
  ariaLabel: string;
}) {
  const location = useLocation();
  const { areas } = useMemo(() => visibleAdminNav(capabilities), [capabilities]);

  return (
    <nav
      className="admin-mobile-navigation"
      aria-label={ariaLabel}
      style={{
        position: "fixed",
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 30,
        maxWidth: "100vw",
        overflowX: "hidden",
        borderTop: "1px solid var(--line)",
        background: "var(--surface)",
        paddingBottom: "max(4px, env(safe-area-inset-bottom))",
      }}
    >
      {areas.length > 0 ? (
        <ul
          className="admin-mobile-navigation__items"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${areas.length}, minmax(0, 1fr))`,
            width: "100%",
            margin: 0,
            padding: 0,
            listStyle: "none",
          }}
        >
          {areas.map((area) => {
            const active = isAdminAreaActive(location, area);
            return (
              <li key={area.id} style={{ minWidth: 0 }}>
                <Link
                  to={area.href}
                  className={
                    "admin-mobile-navigation__link" +
                    (active ? " admin-mobile-navigation__link--active" : "")
                  }
                  aria-current={active ? "page" : undefined}
                  style={{
                    display: "flex",
                    minWidth: 0,
                    minHeight: 44,
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    borderTop: active ? "3px solid var(--accent)" : "3px solid transparent",
                    color: active ? "var(--text)" : "var(--text-2)",
                    font: "inherit",
                    overflowWrap: "anywhere",
                    textAlign: "center",
                    textDecoration: "none",
                    whiteSpace: "normal",
                  }}
                >
                  {area.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </nav>
  );
}
