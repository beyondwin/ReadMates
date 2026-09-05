import { useMemo } from "react";
import {
  visibleAdminNav,
  type AdminRouteOwner,
} from "@/features/platform-admin/model/admin-route-catalog";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import { ReadmatesIcon, type ReadmatesIconName } from "@/shared/ui/icon";
import {
  AdminShellCompactSlot,
  type AdminNavigationLinkRenderer,
} from "./admin-layout-nav";

const ADMIN_MOBILE_ICONS: Record<string, ReadmatesIconName> = {
  today: "calendar",
  clubs: "people",
  service: "shield-check",
  records: "document",
};

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
  const MOBILE_SHORT_LABELS: Record<string, string> = {
    today: "오늘",
    clubs: "클럽",
    service: "상태",
    records: "기록",
  };

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
        paddingBottom: "env(safe-area-inset-bottom)",
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
                  ariaLabel: area.label,
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    minHeight: 110,
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: "16px 4px 8px",
                    borderTop: active ? "3px solid var(--accent)" : "3px solid transparent",
                    color: active ? "var(--text)" : "var(--text-2)",
                    font: "inherit",
                    overflowWrap: "anywhere",
                    textAlign: "center",
                    textDecoration: "none",
                    whiteSpace: "normal",
                  },
                  children: (
                    <>
                      <ReadmatesIcon name={ADMIN_MOBILE_ICONS[area.id] ?? "document"} size={24} />
                      <span>{MOBILE_SHORT_LABELS[area.id] ?? area.label}</span>
                    </>
                  ),
                })}
              </li>
            );
          })}
        </ul>
      ) : null}
    </nav>
  );
}
