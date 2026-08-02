
import type { ComponentType, ReactNode } from "react";
import { useLocation } from "react-router";
import {
  READMATES_MOBILE_TAB_LABELS,
  READMATES_PRIMARY_NAV_LABELS,
} from "./readmates-copy";

export type MobileTabBarVariant = "member" | "host";

type AppLinkProps = {
  to: string;
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
};

export type TabIconName =
  | "home"
  | "session"
  | "notes"
  | "archive"
  | "notifications"
  | "me"
  | "host"
  | "edit"
  | "notify"
  | "invite"
  | "approve";

type TabLink = {
  key: string;
  href: string | null;
  label: string;
  pendingLabel?: string;
  pendingAriaLabel?: string;
  retry?: {
    onRetry: () => void;
    pending: boolean;
  };
  icon: TabIconName;
  state?: { readmatesWorkspace: "host" | "member" };
  current: (pathname: string) => boolean;
};

function DefaultLink({ to, state: _state, children, ...props }: AppLinkProps) {
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
  const editHref =
    currentSessionStatus !== "ready"
      ? null
      : currentSessionId
          ? `/app/host/sessions/${currentSessionId}/edit`
          : "/app/host/sessions/new";
  const retry =
    onRetryCurrentSession && (currentSessionStatus === "error" || currentSessionStatus === "retrying")
      ? {
          onRetry: onRetryCurrentSession,
          pending: currentSessionStatus === "retrying",
        }
      : undefined;

  return [
    {
      key: "host",
      href: "/app/host",
      label: READMATES_MOBILE_TAB_LABELS.hostToday,
      icon: "host",
      current: (pathname) => pathname === "/app/host" || pathname === "/app/host/notifications",
    },
    {
      key: "host-edit",
      href: editHref,
      label: READMATES_MOBILE_TAB_LABELS.hostSession,
      pendingLabel:
        currentSessionStatus === "error"
          ? "다시 확인"
          : currentSessionStatus === "ready"
            ? undefined
            : READMATES_MOBILE_TAB_LABELS.hostSessionPending,
      pendingAriaLabel:
        currentSessionStatus === "error"
          ? "세션 다시 확인"
          : currentSessionStatus === "retrying"
            ? "세션 다시 확인 중"
            : "세션 불러오는 중",
      retry,
      icon: "edit",
      current: (pathname) => pathname === "/app/host/sessions/new" || /^\/app\/host\/sessions\/[^/]+\/edit$/.test(pathname),
    },
    {
      key: "host-members",
      href: "/app/host/members",
      label: READMATES_MOBILE_TAB_LABELS.hostMembers,
      icon: "approve",
      current: (pathname) => pathname === "/app/host/members" || pathname === "/app/host/invitations",
    },
    {
      key: "host-records",
      href: "/app/host/sessions",
      label: READMATES_MOBILE_TAB_LABELS.hostRecords,
      icon: "archive",
      current: (pathname) =>
        pathname === "/app/host/sessions" ||
        /^\/app\/host\/sessions\/[^/]+\/(?:closing|feedback-document)$/.test(pathname),
    },
  ];
}

export function TabIcon({ name }: { name: TabIconName }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-7H9v7H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "session":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M8 2v4M16 2v4M3 10h18M8 15h2M12 15h4M8 18h8" />
        </svg>
      );
    case "notes":
      return (
        <svg {...common}>
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5z" />
          <path d="M5 5.5v16M9 7h6M9 11h6M9 15h4" />
        </svg>
      );
    case "archive":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="4" rx="1" />
          <path d="M5 7v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M10 11h4" />
        </svg>
      );
    case "notifications":
      return (
        <svg {...common}>
          <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5 2 6H4c.5-1 2-2 2-6z" />
          <path d="M9.5 19a2.7 2.7 0 0 0 5 0" />
        </svg>
      );
    case "me":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      );
    case "host":
      return (
        <svg {...common}>
          <path d="M4 20V10l8-6 8 6v10a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
          <path d="M13.5 7.5l3 3" />
        </svg>
      );
    case "notify":
      return (
        <svg {...common}>
          <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2.5 6.5H3.5C4.5 15.5 6 14 6 10z" />
          <path d="M10 20a2.2 2.2 0 0 0 4 0" />
        </svg>
      );
    case "invite":
      return (
        <svg {...common}>
          <path d="M4 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
          <path d="m4 7 8 6 8-6M16 4v6M13 7h6" />
        </svg>
      );
    case "approve":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3.5 20c1.1-4 3-6 5.5-6 1.6 0 2.9.8 4 2.3M15 18l2 2 4-5" />
        </svg>
      );
  }
}

export function MobileTabBar({
  variant,
  currentSessionId,
  currentSessionStatus,
  onRetryCurrentSession,
  appBasePath = "",
  LinkComponent = DefaultLink,
}: MobileTabBarProps) {
  const pathname = useLocation().pathname;
  const appPath = appPathname(pathname);
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
    <nav
      className="m-tabbar"
      data-variant={variant}
      aria-label="앱 탭"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) =>
        tab.href ? (
          <LinkComponent
            key={tab.key}
            to={tab.href}
            state={tab.state}
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
