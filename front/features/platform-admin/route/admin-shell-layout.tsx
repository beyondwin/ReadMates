import type { MouseEvent, ReactNode } from "react";
import { Link, Outlet } from "react-router";
import type { AdminRouteOwner } from "@/features/platform-admin/model/admin-route-catalog";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { AdminAlarmSummary } from "@/features/platform-admin/model/admin-alarm-summary";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import { AdminAlarmBar } from "@/features/platform-admin/ui/admin-alarm-bar";
import { AdminBreadcrumb } from "@/features/platform-admin/ui/admin-breadcrumb";
import {
  AdminLayoutNav,
  type AdminNavigationLinkRenderProps,
} from "@/features/platform-admin/ui/admin-layout-nav";
import { AdminMobileNavigation } from "@/features/platform-admin/ui/admin-mobile-navigation";
import { useAdminContentWidth } from "@/features/platform-admin/ui/use-admin-content-width";
import { ReadmatesIcon } from "@/shared/ui/icon";
import {
  AdminShellStatusProvider,
  useAdminShellStatusValue,
  type AdminShellStatus,
} from "./admin-shell-status-context";
import "@/features/platform-admin/ui/admin-shell.css";
import "@/features/platform-admin/ui/admin-page-patterns.css";
import "@/features/platform-admin/ui/admin-editorial-ledger.css";
import "@/features/platform-admin/ui/admin-today.css";
import "@/features/platform-admin/ui/admin-club-management.css";

export type AdminShellOutletContext = {
  authorityEpoch: number;
  contentLayout?: "flow" | "split";
};

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
  accountNameVisible?: boolean;
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
  accountNameVisible = false,
}: AdminShellLayoutProps) {
  const { ref: mainRef, layout: measuredLayout } = useAdminContentWidth<HTMLElement>();
  const contentLayout = outletContext.contentLayout ?? measuredLayout;
  return (
    <AdminShellStatusProvider>
      <div className="admin-shell" data-content-layout={contentLayout}>
        <a href="#admin-main" className="admin-shell__skip-link" onClick={focusAdminMain}>
          본문으로 건너뛰기
        </a>
        <header className="admin-shell__header">
          <span className="admin-shell__wordmark">ReadMates</span>
          <div key={spaceControlEpoch} className="admin-shell__space-control admin-shell__space-switcher">
            {spaceSwitcher}
          </div>
          <AdminShellHeaderStatus alarm={alarm} />
          <div className="admin-shell__header-actions">
            <div className="admin-shell__account-control">
              {accountNameVisible ? (
                <span className="admin-shell__account-name">{workspaceAccountLabel}</span>
              ) : null}
              <button
                type="button"
                className="admin-shell__account-button"
                disabled={accountBusy}
                onClick={onOtherAccountLogin}
                aria-label={accountBusy ? "로그아웃 중" : "계정"}
              >
                <ReadmatesIcon name="person-circle" size={24} />
                <ReadmatesIcon name="chevron-down" size={16} />
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
              accountBusy={accountBusy}
              onLogout={onOtherAccountLogin}
            />
          </aside>
          <main id="admin-main" ref={mainRef} className="admin-shell__main" tabIndex={-1}>
            <AdminBreadcrumb routePath={routePath} extra={breadcrumbExtra} />
            <AdminAlarmBar summary={alarm.summary} state={alarm.state} />
            <Outlet context={{ ...outletContext, contentLayout }} />
          </main>
        </div>
        <AdminMobileNavigation
          capabilities={capabilities}
          currentOwner={currentNavigationOwner}
          renderLink={renderAdminNavigationLink}
          ariaLabel="Admin 모바일 메뉴"
        />
      </div>
    </AdminShellStatusProvider>
  );
}

function AdminShellHeaderStatus({ alarm }: { alarm: AdminShellLayoutProps["alarm"] }) {
  const routeStatus = useAdminShellStatusValue();
  const fallback = defaultShellStatus(alarm);
  const status = routeStatus ?? fallback;
  if (!status) return null;
  const icon = status.tone === "ok" ? "check-circle" : status.tone === "danger" || status.tone === "warn" ? "alert-circle" : "info";
  return (
    <>
      <p
        className="admin-shell__status admin-shell__status--band"
        data-tone={status.tone}
        role={status.tone === "danger" ? "status" : undefined}
      >
        <ReadmatesIcon name={icon} size={20} />
        <span>{status.text}</span>
      </p>
      {status.aside ? (
        <span className="admin-shell__status-aside">
          <ReadmatesIcon name="clock" size={16} />
          {status.aside}
        </span>
      ) : null}
    </>
  );
}

function defaultShellStatus(alarm: AdminShellLayoutProps["alarm"]): AdminShellStatus | null {
  if (alarm.state === "unavailable") return { tone: "danger", text: ADMIN_COPY.alarm.unavailable };
  if (alarm.state !== "ready" || !alarm.summary) return null;
  const count = alarm.summary.attention.count;
  if (alarm.summary.serviceState === "ok") {
    return { tone: count > 0 ? "ok" : "neutral", text: count > 0 ? `서비스는 정상이며, 확인할 일이 ${count}건 있습니다.` : "서비스는 정상입니다." };
  }
  return { tone: "warn", text: `${ADMIN_COPY.alarm.serviceDegraded} · ${ADMIN_COPY.alarm.attention} ${count}건` };
}

function renderAdminNavigationLink({
  href,
  className,
  ariaCurrent,
  ariaLabel,
  style,
  children,
}: AdminNavigationLinkRenderProps) {
  return (
    <Link to={href} className={className} aria-current={ariaCurrent} aria-label={ariaLabel} style={style}>
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
