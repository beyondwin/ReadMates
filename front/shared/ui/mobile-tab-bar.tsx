
import type { ComponentType, ReactNode } from "react";
import { useLocation } from "react-router";
import {
  READMATES_MOBILE_TAB_LABELS,
  READMATES_PRIMARY_NAV_LABELS,
} from "./readmates-copy";
import { hasHostRecordsReturnState } from "@/shared/routing/readmates-route-state";
import { HOST_ROUTE_HREFS } from "@/shared/routing/host-route-destinations";
import type { PrimaryNavigationItem } from "@/shared/model/app-club-shell";
import { ReadmatesIcon, type ReadmatesIconName } from "./icon";

export type MobileTabBarVariant = "member" | "host";

type AppLinkProps = {
  to: string;
  replace?: boolean;
  state?: unknown;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page";
};

export type AppLinkComponent = ComponentType<AppLinkProps>;

type MobileTabBarProps = {
  variant: MobileTabBarVariant;
  currentSessionId?: string | null | undefined;
  currentSessionStatus?: "ready" | "loading" | "error" | "retrying";
  onRetryCurrentSession?: () => void;
  appBasePath?: string;
  LinkComponent?: AppLinkComponent;
  items?: ReadonlyArray<PrimaryNavigationItem>;
  navLabel?: string;
};

export type TabIconName = ReadmatesIconName;

const LEGACY_TAB_ICON: Record<string, ReadmatesIconName> = {
  session: "calendar",
  notes: "notes",
  archive: "document",
  me: "person",
  host: "home",
  notify: "bell",
  invite: "mail",
  approve: "people",
  edit: "edit",
  notifications: "bell",
  home: "home",
};

type TabLink = {
  key: string;
  href: string | null;
  label: string;
  replace?: boolean;
  pendingLabel?: string;
  pendingAriaLabel?: string;
  retry?: {
    onRetry: () => void;
    pending: boolean;
  };
  icon: TabIconName | string;
  current: (pathname: string) => boolean;
};

function DefaultLink({ to, replace: _replace, state: _state, children, ...props }: AppLinkProps) {
  void _replace;
  void _state;

  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

const memberTabs: TabLink[] = [
  {
    key: "home",
    href: "/app",
    label: READMATES_PRIMARY_NAV_LABELS.member.today,
    icon: "home",
    current: (pathname) =>
      pathname === "/app" || pathname === "/app/session" || pathname.startsWith("/app/session/"),
  },
  {
    key: "notes",
    href: "/app/notes",
    label: READMATES_PRIMARY_NAV_LABELS.member.notes,
    icon: "notes",
    current: (pathname) => pathname === "/app/notes",
  },
  {
    key: "archive",
    href: "/app/archive",
    label: READMATES_PRIMARY_NAV_LABELS.member.records,
    icon: "archive",
    current: (pathname) =>
      pathname.startsWith("/app/archive") || pathname.startsWith("/app/sessions/") || pathname.startsWith("/app/feedback/"),
  },
  {
    key: "me",
    href: "/app/me",
    label: READMATES_PRIMARY_NAV_LABELS.member.mySpace,
    icon: "me",
    current: (pathname) => pathname.startsWith("/app/me") || pathname.startsWith("/app/notifications"),
  },
];

function prefixedAppPath(appBasePath: string, path: string) {
  return appBasePath ? `${appBasePath}${path === "/app" ? "" : path.replace(/^\/app/, "")}` : path;
}

function appPathname(pathname: string) {
  return pathname.replace(/^\/clubs\/[^/]+(?=\/app(?:\/|$))/, "");
}

function scopedTabs(tabs: TabLink[], appBasePath: string): TabLink[] {
  return tabs.map((tab) => ({
    ...tab,
    href: tab.href ? prefixedAppPath(appBasePath, tab.href) : tab.href,
  }));
}

function hostTabs({
  currentSessionId,
  currentSessionStatus,
  onRetryCurrentSession,
}: {
  currentSessionId?: string | null;
  currentSessionStatus: "ready" | "loading" | "error" | "retrying";
  onRetryCurrentSession?: () => void;
}): TabLink[] {
  void currentSessionId;
  void currentSessionStatus;
  void onRetryCurrentSession;

  return [
    {
      key: "host-operating-room",
      href: HOST_ROUTE_HREFS.operatingRoom,
      label: READMATES_MOBILE_TAB_LABELS.hostOperatingRoom,
      icon: "home",
      current: (pathname) => pathname === "/app/host" || pathname === "/app/host/operations",
    },
    {
      key: "host-meetings",
      href: HOST_ROUTE_HREFS.meetings,
      label: READMATES_MOBILE_TAB_LABELS.hostMeetings,
      icon: "calendar",
      current: (pathname) =>
        pathname === "/app/host/sessions"
        || pathname === "/app/host/sessions/new"
        || /^\/app\/host\/sessions\/[^/]+(?:\/edit)?$/.test(pathname)
    },
    {
      key: "host-people",
      href: HOST_ROUTE_HREFS.people,
      label: READMATES_MOBILE_TAB_LABELS.hostPeople,
      icon: "people",
      current: (pathname) => pathname === "/app/host/people"
        || pathname.startsWith("/app/host/people/")
        || pathname === "/app/host/members",
    },
    {
      key: "host-records",
      href: HOST_ROUTE_HREFS.records,
      label: READMATES_MOBILE_TAB_LABELS.hostRecords,
      icon: "document",
      current: (pathname) => pathname === "/app/host/records"
        || /^\/app\/host\/sessions\/[^/]+\/(?:closing|feedback-document)$/.test(pathname),
    },
  ];
}

export function TabIcon({ name }: { name: TabIconName | string }) {
  const resolved = LEGACY_TAB_ICON[name] ?? (name as ReadmatesIconName);
  return <ReadmatesIcon name={resolved} size={24} strokeWidth={1.6} />;
}

function MobileTabBarFrame({
  variant,
  tabs,
  appPath,
  navLabel,
  LinkComponent,
}: {
  variant: MobileTabBarVariant;
  tabs: ReadonlyArray<TabLink>;
  appPath: string;
  navLabel: string;
  LinkComponent: AppLinkComponent;
}) {
  return (
    <nav
      className="m-tabbar rm-mobile-tab-bar"
      data-variant={variant}
      aria-label={navLabel}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) =>
        tab.href ? (
          <LinkComponent
            key={tab.key}
            to={tab.href}
            replace={tab.replace}
            className="m-tab"
            aria-current={tab.current(appPath) ? "page" : undefined}
          >
            <TabIcon name={tab.icon} />
            <span className="m-tab-label">{tab.label}</span>
          </LinkComponent>
        ) : tab.retry ? (
          <button
            key={tab.key}
            type="button"
            className="m-tab is-pending"
            aria-current={tab.current(appPath) ? "page" : undefined}
            aria-label={tab.pendingAriaLabel}
            disabled={tab.retry.pending}
            onClick={tab.retry.onRetry}
          >
            <TabIcon name={tab.icon} />
            <span className="m-tab-label" aria-hidden="true">
              {tab.pendingLabel ?? tab.label}
            </span>
          </button>
        ) : (
          <span
            key={tab.key}
            className="m-tab is-pending"
            aria-disabled="true"
            aria-current={tab.current(appPath) ? "page" : undefined}
            aria-label={tab.pendingAriaLabel ?? `${tab.label} 불러오는 중`}
          >
            <TabIcon name={tab.icon} />
            <span className="m-tab-label" aria-hidden="true">
              {tab.pendingLabel ?? tab.label}
            </span>
            <span className="rm-sr-only">{tab.pendingAriaLabel ?? `${tab.label} 불러오는 중`}</span>
          </span>
        ),
      )}
    </nav>
  );
}

function RouteAwareMobileTabBar({
  variant,
  currentSessionId,
  currentSessionStatus,
  onRetryCurrentSession,
  appBasePath,
  LinkComponent,
  navLabel,
}: Omit<MobileTabBarProps, "items"> & {
  appBasePath: string;
  LinkComponent: AppLinkComponent;
  navLabel: string;
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const rawAppPath = appPathname(pathname);
  const appPath = variant === "host"
    && /^\/app\/host\/sessions\/[^/]+(?:\/edit)?$/.test(rawAppPath)
    && hasHostRecordsReturnState(location.state, pathname)
    ? HOST_ROUTE_HREFS.records
    : rawAppPath;
  const resolvedCurrentSessionStatus =
    currentSessionStatus ?? (currentSessionId === undefined ? "loading" : "ready");
  const tabs = scopedTabs(
    variant === "host"
      ? hostTabs({
          currentSessionId,
          currentSessionStatus: resolvedCurrentSessionStatus,
          onRetryCurrentSession,
        })
      : memberTabs,
    appBasePath,
  );

  return (
    <MobileTabBarFrame
      variant={variant}
      tabs={tabs}
      appPath={appPath}
      navLabel={navLabel}
      LinkComponent={LinkComponent}
    />
  );
}

export function MobileTabBar({
  variant,
  currentSessionId,
  currentSessionStatus,
  onRetryCurrentSession,
  appBasePath = "",
  LinkComponent = DefaultLink,
  items,
  navLabel = "앱 탭",
}: MobileTabBarProps) {
  if (items) {
    const tabs: TabLink[] = items.map((item) => ({
      key: item.id,
      href: item.href,
      label: item.mobileLabel ?? item.label,
      icon: item.icon,
      replace: item.navigation === "replace",
      current: () => item.current,
    }));
    return (
      <MobileTabBarFrame
        variant={variant}
        tabs={tabs}
        appPath=""
        navLabel={navLabel}
        LinkComponent={LinkComponent}
      />
    );
  }

  return (
    <RouteAwareMobileTabBar
      variant={variant}
      currentSessionId={currentSessionId}
      currentSessionStatus={currentSessionStatus}
      onRetryCurrentSession={onRetryCurrentSession}
      appBasePath={appBasePath}
      LinkComponent={LinkComponent}
      navLabel={navLabel}
    />
  );
}
