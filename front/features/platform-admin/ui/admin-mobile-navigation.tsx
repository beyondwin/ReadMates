import { useMemo } from "react";
import {
  visibleAdminNav,
  type AdminRouteOwner,
} from "@/features/platform-admin/model/admin-route-catalog";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  AdminShellCompactSlot,
  type AdminNavigationLinkRenderer,
} from "./admin-layout-nav";

export function AdminMobileNavigation({
  capabilities,
  currentOwner,
  renderLink,
  ariaLabel = "플랫폼 관리 모바일 메뉴",
}: {
  capabilities: PlatformAdminCapabilities | null | undefined;
  currentOwner: AdminRouteOwner | null;
  renderLink: AdminNavigationLinkRenderer;
  ariaLabel?: string;
}) {
  return (
    <AdminShellCompactSlot>
      <AdminMobileNavigationContent
        capabilities={capabilities}
        currentOwner={currentOwner}
        renderLink={renderLink}
        ariaLabel={ariaLabel}
      />
    </AdminShellCompactSlot>
  );
}

function AdminMobileNavigationContent({
  capabilities,
  currentOwner,
  renderLink,
  ariaLabel,
}: {
  capabilities: PlatformAdminCapabilities | null | undefined;
  currentOwner: AdminRouteOwner | null;
  renderLink: AdminNavigationLinkRenderer;
  ariaLabel: string;
}) {
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
        background: "var(--bg-raised)",
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
            const active = currentOwner === area.id;
            return (
              <li key={area.id} style={{ minWidth: 0 }}>
                {renderLink({
                  href: area.href,
                  className:
                    "admin-mobile-navigation__link" +
                    (active ? " admin-mobile-navigation__link--active" : ""),
                  ariaCurrent: active ? "page" : undefined,
                  style: {
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
                  },
                  children: <span>{area.label}</span>,
                })}
              </li>
            );
          })}
        </ul>
      ) : null}
    </nav>
  );
}
