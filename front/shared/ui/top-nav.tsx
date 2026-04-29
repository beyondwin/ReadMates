"use client";

import { useLocation } from "react-router-dom";
import { Link } from "@/src/app/router-link";
import { AvatarChip } from "./avatar-chip";
import { usePublicAuthAction, type PublicAuthAction } from "./public-auth-action-state";
import { ReadmatesBrandMark } from "./readmates-brand-mark";
import { READMATES_NAV_LABELS, READMATES_WORKSPACE_LABELS } from "./readmates-copy";
import { WorkspaceSwitchIcon } from "./workspace-switch-icon";

export type TopNavVariant = "guest" | "member" | "host";

type NavLink = {
  key: string;
  href: string;
  label: string;
  current: (pathname: string) => boolean;
};

type TopNavProps = {
  variant?: TopNavVariant;
  memberName?: string | null;
  showHostEntry?: boolean;
  authenticated?: boolean;
  publicBasePath?: string;
};

const memberLinks: NavLink[] = [
  { key: "home", href: "/app", label: READMATES_NAV_LABELS.member.home, current: (pathname) => pathname === "/app" },
  {
    key: "session",
    href: "/app/session/current",
    label: READMATES_NAV_LABELS.member.currentSession,
    current: (pathname) => pathname === "/app/session" || pathname.startsWith("/app/session/"),
  },
  {
    key: "notes",
    href: "/app/notes",
    label: READMATES_NAV_LABELS.member.clubNotes,
    current: (pathname) => pathname === "/app/notes",
  },
  {
    key: "archive",
    href: "/app/archive",
    label: READMATES_NAV_LABELS.member.archive,
    current: (pathname) =>
      pathname.startsWith("/app/archive") || pathname.startsWith("/app/sessions/") || pathname.startsWith("/app/feedback/"),
  },
  {
    key: "notifications",
    href: "/app/notifications",
    label: READMATES_NAV_LABELS.member.notifications,
    current: (pathname) => pathname.startsWith("/app/notifications"),
  },
  { key: "me", href: "/app/me", label: READMATES_NAV_LABELS.member.mySpace, current: (pathname) => pathname.startsWith("/app/me") },
];

const hostEntryLink: NavLink = {
  key: "host-entry",
  href: "/app/host",
  label: READMATES_WORKSPACE_LABELS.hostWorkspace,
  current: (pathname) => pathname.startsWith("/app/host"),
};

const hostLinks: NavLink[] = [
  {
    key: "host-operations",
    href: "/app/host",
    label: READMATES_NAV_LABELS.host.operations,
    current: (pathname) => pathname === "/app/host",
  },
  {
    key: "host-session-edit",
    href: "/app/host/sessions/new",
    label: READMATES_NAV_LABELS.host.sessionEditor,
    current: (pathname) => pathname === "/app/host/sessions/new" || /^\/app\/host\/sessions\/[^/]+\/edit$/.test(pathname),
  },
  {
    key: "host-notifications",
    href: "/app/host/notifications",
    label: READMATES_NAV_LABELS.host.notifications,
    current: (pathname) => pathname === "/app/host/notifications",
  },
  {
    key: "host-invitations",
    href: "/app/host/invitations",
    label: READMATES_NAV_LABELS.host.invitations,
    current: (pathname) => pathname === "/app/host/invitations",
  },
  {
    key: "host-members",
    href: "/app/host/members",
    label: READMATES_NAV_LABELS.host.memberApproval,
    current: (pathname) => pathname === "/app/host/members",
  },
];

const memberReturnLink: NavLink = {
  key: "member-workspace",
  href: "/app",
  label: READMATES_WORKSPACE_LABELS.memberWorkspaceReturn,
  current: (pathname) => pathname === "/app",
};

function prefixedPath(publicBasePath: string, path: string) {
  return publicBasePath ? `${publicBasePath}${path === "/" ? "" : path}` : path;
}

function guestLinks(publicBasePath: string): NavLink[] {
  return [
    {
      key: "home",
      href: prefixedPath(publicBasePath, "/"),
      label: READMATES_NAV_LABELS.public.intro,
      current: (pathname) => pathname === prefixedPath(publicBasePath, "/"),
    },
    {
      key: "club",
      href: prefixedPath(publicBasePath, "/about"),
      label: READMATES_NAV_LABELS.public.club,
      current: (pathname) => pathname === prefixedPath(publicBasePath, "/about"),
    },
    {
      key: "public-record",
      href: prefixedPath(publicBasePath, "/records"),
      label: READMATES_NAV_LABELS.public.publicRecords,
      current: (pathname) =>
        pathname === prefixedPath(publicBasePath, "/records") ||
        pathname.startsWith(prefixedPath(publicBasePath, "/sessions/")),
    },
    { key: "login", href: "/login", label: READMATES_NAV_LABELS.public.login, current: (pathname) => pathname === "/login" },
  ];
}

function Brand({ href }: { href: string }) {
  return (
    <Link to={href} className="row" style={{ gap: "10px" }}>
      <ReadmatesBrandMark />
      <span>
        <span
          className="editorial"
          style={{
            display: "block",
            fontSize: "16px",
            lineHeight: 1,
            letterSpacing: "-0.025em",
            fontWeight: 600,
          }}
        >
          읽는사이
        </span>
        <span className="tiny mono" style={{ display: "block", marginTop: "2px" }}>
          독서 모임
        </span>
      </span>
    </Link>
  );
}

function TopNavFrame({
  brandHref,
  navLabel,
  links,
  pathname,
  memberName,
  workspaceAction,
}: {
  brandHref: string;
  navLabel: string;
  links: NavLink[];
  pathname: string;
  memberName?: string | null;
  workspaceAction?: NavLink | null;
}) {
  return (
    <header className="topnav">
      <div className="container topnav-inner">
        <Brand href={brandHref} />

        <div className="row" style={{ gap: "12px" }}>
          <nav className="nav-links" aria-label={navLabel}>
            {links.map((link) => (
              <Link
                key={link.key}
                to={link.href}
                className="nav-link"
                aria-current={link.current(pathname) ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          {workspaceAction ? (
            <Link
              to={workspaceAction.href}
              className="rm-workspace-switch"
              aria-label={workspaceAction.label}
              title={workspaceAction.label}
            >
              <WorkspaceSwitchIcon size={17} />
            </Link>
          ) : null}
          {memberName ? (
            <AvatarChip name={memberName} label={memberName} size={28} />
          ) : null}
        </div>
      </div>
    </header>
  );
}

function guestLinksWithAction(links: NavLink[], authAction: PublicAuthAction): NavLink[] {
  return links.map((link) =>
    link.key === "login"
      ? {
          ...link,
          href: authAction.href,
          label: authAction.label,
          current: (pathname) => authAction.href === "/login" && pathname === "/login",
        }
      : link,
  );
}

function GuestTopNav({ authenticated, publicBasePath = "" }: { authenticated?: boolean; publicBasePath?: string }) {
  const pathname = useLocation().pathname;
  const authAction = usePublicAuthAction({ href: "/login", label: READMATES_NAV_LABELS.public.login }, authenticated);
  const links = guestLinks(publicBasePath);

  return (
    <TopNavFrame
      brandHref={prefixedPath(publicBasePath, "/")}
      navLabel="공개 내비게이션"
      links={guestLinksWithAction(links, authAction)}
      pathname={pathname}
    />
  );
}

function AppTopNav({
  variant,
  memberName,
  showHostEntry,
}: {
  variant: Exclude<TopNavVariant, "guest">;
  memberName?: string | null;
  showHostEntry?: boolean;
}) {
  const pathname = useLocation().pathname;
  const links = variant === "host" ? hostLinks : memberLinks;
  const workspaceAction = variant === "host" ? memberReturnLink : showHostEntry ? hostEntryLink : null;

  return (
    <TopNavFrame
      brandHref={variant === "host" ? "/app/host" : "/app"}
      navLabel="앱 내비게이션"
      links={links}
      pathname={pathname}
      memberName={memberName}
      workspaceAction={workspaceAction}
    />
  );
}

export function TopNav({ variant = "guest", memberName, showHostEntry, authenticated, publicBasePath }: TopNavProps) {
  if (variant === "guest") {
    return <GuestTopNav authenticated={authenticated} publicBasePath={publicBasePath} />;
  }

  return <AppTopNav variant={variant} memberName={memberName} showHostEntry={showHostEntry} />;
}
