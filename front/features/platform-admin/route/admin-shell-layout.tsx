import type { MouseEvent, ReactNode } from "react";
import { Link, Outlet } from "react-router";
import type { AdminRouteOwner } from "@/features/platform-admin/model/admin-route-catalog";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { AdminAlarmSummary } from "@/features/platform-admin/model/admin-alarm-summary";
import { AdminAlarmBar } from "@/features/platform-admin/ui/admin-alarm-bar";
import { AdminBreadcrumb } from "@/features/platform-admin/ui/admin-breadcrumb";
import {
  AdminLayoutNav,
  type AdminNavigationLinkRenderProps,
} from "@/features/platform-admin/ui/admin-layout-nav";
import { AdminMobileNavigation } from "@/features/platform-admin/ui/admin-mobile-navigation";
import "@/features/platform-admin/ui/admin-shell.css";
import "@/features/platform-admin/ui/admin-page-patterns.css";
import "@/features/platform-admin/ui/admin-editorial-ledger.css";
import "@/features/platform-admin/ui/admin-club-management.css";

export type AdminShellOutletContext = { authorityEpoch: number };

type AdminShellLayoutProps = {
  workspaceAccountLabel: string;
  spaceSwitcher: ReactNode;
  spaceControlEpoch: number;
  capabilities: PlatformAdminCapabilities | null;
  currentNavigationOwner: AdminRouteOwner | null;
  routePath: string;
  breadcrumbExtra: string | null;
  alarm: {
    summary: AdminAlarmSummary | null;
    state: "ready" | "loading" | "unavailable";
  };
  accountBusy: boolean;
  accountError: string | null;
  onOtherAccountLogin: () => void;
  outletContext: AdminShellOutletContext;
};

export function AdminShellLayout({
  workspaceAccountLabel,
  spaceSwitcher,
  spaceControlEpoch,
  capabilities,
  currentNavigationOwner,
  routePath,
  breadcrumbExtra,
  alarm,
  accountBusy,
  accountError,
  onOtherAccountLogin,
  outletContext,
}: AdminShellLayoutProps) {
  return (
    <div className="admin-shell">
      <a href="#admin-main" className="admin-shell__skip-link" onClick={focusAdminMain}>
        본문으로 건너뛰기
      </a>
      <header className="admin-shell__header">
        <span className="admin-shell__wordmark">ReadMates · 운영</span>
        <AdminBreadcrumb routePath={routePath} extra={breadcrumbExtra} />
        <div className="admin-shell__header-actions">
          <div key={spaceControlEpoch} className="admin-shell__space-control">
            {spaceSwitcher}
          </div>
          <div className="admin-shell__account-control">
            <span className="admin-shell__account-label">{workspaceAccountLabel}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={accountBusy}
              onClick={onOtherAccountLogin}
            >
              {accountBusy ? "로그아웃 중" : "다른 계정으로 로그인"}
            </button>
            {accountError ? <p role="alert">{accountError}</p> : null}
          </div>
        </div>
      </header>
      <div className="admin-shell__body">
        <aside className="admin-shell__nav">
          <AdminLayoutNav
            capabilities={capabilities}
            currentOwner={currentNavigationOwner}
            renderLink={renderAdminNavigationLink}
            ariaLabel="Admin 콘솔"
            todayCount={alarm.summary?.attention.count ?? null}
          />
        </aside>
        <main id="admin-main" className="admin-shell__main" tabIndex={-1}>
          <AdminAlarmBar summary={alarm.summary} state={alarm.state} />
          <Outlet context={outletContext} />
        </main>
      </div>
      <AdminMobileNavigation
        capabilities={capabilities}
        currentOwner={currentNavigationOwner}
        renderLink={renderAdminNavigationLink}
        ariaLabel="Admin 모바일 메뉴"
      />
    </div>
  );
}

function renderAdminNavigationLink({
  href,
  className,
  ariaCurrent,
  style,
  children,
}: AdminNavigationLinkRenderProps) {
  return (
    <Link to={href} className={className} aria-current={ariaCurrent} style={style}>
      {children}
    </Link>
  );
}

function focusAdminMain(event: MouseEvent<HTMLAnchorElement>) {
  const main = document.getElementById("admin-main");
  if (!main) return;
  event.preventDefault();
  main.focus();
}
