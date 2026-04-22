"use client";

import { useLocation } from "react-router-dom";
import { Link } from "@/src/app/router-link";
import { READMATES_MOBILE_TAB_LABELS, READMATES_NAV_LABELS } from "./readmates-copy";

export type MobileTabBarVariant = "member" | "host";

type MobileTabBarProps = {
  variant: MobileTabBarVariant;
  currentSessionId?: string | null | undefined;
};

type TabIconName = "home" | "session" | "notes" | "archive" | "me" | "host" | "edit" | "invite" | "approve";

type TabLink = {
  key: string;
  href: string | null;
  label: string;
  pendingLabel?: string;
  icon: TabIconName;
  current: (pathname: string) => boolean;
};

const memberTabs: TabLink[] = [
  { key: "home", href: "/app", label: READMATES_NAV_LABELS.member.home, icon: "home", current: (pathname) => pathname === "/app" },
  {
    key: "session",
    href: "/app/session/current",
    label: READMATES_NAV_LABELS.member.currentSession,
    icon: "session",
    current: (pathname) => pathname === "/app/session" || pathname.startsWith("/app/session/"),
  },
  {
    key: "notes",
    href: "/app/notes",
    label: READMATES_NAV_LABELS.member.clubNotes,
    icon: "notes",
    current: (pathname) => pathname === "/app/notes",
  },
  {
    key: "archive",
    href: "/app/archive",
    label: READMATES_NAV_LABELS.member.archive,
    icon: "archive",
    current: (pathname) =>
      pathname.startsWith("/app/archive") || pathname.startsWith("/app/sessions/") || pathname.startsWith("/app/feedback/"),
  },
  {
    key: "me",
    href: "/app/me",
    label: READMATES_NAV_LABELS.member.mySpace,
    icon: "me",
    current: (pathname) => pathname.startsWith("/app/me"),
  },
];

function hostTabs(currentSessionId?: string | null): TabLink[] {
  const editHref =
    currentSessionId === undefined
      ? null
      : currentSessionId
        ? `/app/host/sessions/${currentSessionId}/edit`
        : "/app/host/sessions/new";

  return [
    {
      key: "host",
      href: "/app/host",
      label: READMATES_MOBILE_TAB_LABELS.hostToday,
      icon: "host",
      current: (pathname) => pathname === "/app/host",
    },
    {
      key: "host-edit",
      href: editHref,
      label: READMATES_MOBILE_TAB_LABELS.hostSession,
      pendingLabel: currentSessionId === undefined ? READMATES_MOBILE_TAB_LABELS.hostSessionPending : undefined,
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
      href: "/app/archive",
      label: READMATES_MOBILE_TAB_LABELS.hostRecords,
      icon: "archive",
      current: (pathname) =>
        pathname.startsWith("/app/archive") || pathname.startsWith("/app/sessions/") || pathname.startsWith("/app/feedback/"),
    },
  ];
}

function TabIcon({ name }: { name: TabIconName }) {
  const common = {
    width: 20,
    height: 20,
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

export function MobileTabBar({ variant, currentSessionId }: MobileTabBarProps) {
  const pathname = useLocation().pathname;
  const tabs = variant === "host" ? hostTabs(currentSessionId) : memberTabs;

  return (
    <nav className="m-tabbar" aria-label="앱 탭" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((tab) =>
        tab.href ? (
          <Link
            key={tab.key}
            to={tab.href}
            className="m-tab"
            aria-current={tab.current(pathname) ? "page" : undefined}
          >
            <TabIcon name={tab.icon} />
            <span className="m-tab-label">{tab.label}</span>
          </Link>
        ) : (
          <span
            key={tab.key}
            className="m-tab is-pending"
            aria-disabled="true"
            aria-current={tab.current(pathname) ? "page" : undefined}
            aria-label={`${tab.label} 불러오는 중`}
          >
            <TabIcon name={tab.icon} />
            <span className="m-tab-label" aria-hidden="true">
              {tab.pendingLabel ?? tab.label}
            </span>
            <span className="rm-sr-only">{tab.label} 불러오는 중</span>
          </span>
        ),
      )}
    </nav>
  );
}
