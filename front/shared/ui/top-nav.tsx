
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AvatarChip } from "./avatar-chip";
import { usePublicAuthAction, type PublicAuthAction } from "./public-auth-action-state";
import { ReadmatesBrandMark } from "./readmates-brand-mark";
import {
  READMATES_NAV_LABELS,
  READMATES_PRIMARY_NAV_LABELS,
  READMATES_WORKSPACE_LABELS,
} from "./readmates-copy";
import { WorkspaceSwitchIcon } from "./workspace-switch-icon";

export type TopNavVariant = "guest" | "member" | "host";

type AppLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page";
  title?: string;
  style?: CSSProperties;
};

export type AppLinkComponent = ComponentType<AppLinkProps>;

type NavLink = {
  key: string;
  href: string | null;
  label: string;
  pendingLabel?: string;
  pendingAriaLabel?: string;
  retry?: {
    onRetry: () => void;
    pending: boolean;
  };
  current: (pathname: string) => boolean;
};

export type CurrentSessionNavigationStatus = "ready" | "loading" | "error" | "retrying";

type TopNavProps = {
  variant?: TopNavVariant;
  memberName?: string | null;
  memberAvatarKey?: string | null;
  showHostEntry?: boolean;
  authenticated?: boolean;
  publicBasePath?: string;
  appBasePath?: string;
  currentSessionId?: string | null;
  currentSessionStatus?: CurrentSessionNavigationStatus;
  onRetryCurrentSession?: () => void;
  LinkComponent?: AppLinkComponent;
  accountControl?: ReactNode;
};

const memberLinks: NavLink[] = [
  {
    key: "home",
    href: "/app",
    label: READMATES_PRIMARY_NAV_LABELS.member.today,
    current: (pathname) =>
      pathname === "/app" || pathname === "/app/session" || pathname.startsWith("/app/session/"),
  },
  {
    key: "notes",
    href: "/app/notes",
    label: READMATES_PRIMARY_NAV_LABELS.member.notes,
    current: (pathname) => pathname === "/app/notes",
  },
  {
    key: "archive",
    href: "/app/archive",
    label: READMATES_PRIMARY_NAV_LABELS.member.records,
    current: (pathname) =>
      pathname.startsWith("/app/archive") || pathname.startsWith("/app/sessions/") || pathname.startsWith("/app/feedback/"),
  },
  {
    key: "me",
    href: "/app/me",
    label: READMATES_PRIMARY_NAV_LABELS.member.mySpace,
    current: (pathname) => pathname.startsWith("/app/me") || pathname.startsWith("/app/notifications"),
  },
];

const hostEntryLink: NavLink = {
  key: "host-entry",
  href: "/app/host",
  label: READMATES_WORKSPACE_LABELS.hostWorkspace,
  current: (pathname) => pathname.startsWith("/app/host"),
};

function hostLinks({
  currentSessionId,
  currentSessionStatus,
  onRetryCurrentSession,
}: {
  currentSessionId?: string | null;
  currentSessionStatus: CurrentSessionNavigationStatus;
  onRetryCurrentSession?: () => void;
}): NavLink[] {
  const sessionHref =
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
      key: "host-operations",
      href: "/app/host",
      label: READMATES_PRIMARY_NAV_LABELS.host.today,
      current: (pathname) => pathname === "/app/host" || pathname === "/app/host/notifications",
    },
    {
      key: "host-session",
      href: sessionHref,
      label: READMATES_PRIMARY_NAV_LABELS.host.session,
      pendingLabel: currentSessionStatus === "error" ? "다시 확인" : "확인 중",
      pendingAriaLabel:
        currentSessionStatus === "error"
          ? "세션 다시 확인"
          : currentSessionStatus === "retrying"
            ? "세션 다시 확인 중"
            : "세션 불러오는 중",
      retry,
      current: (pathname) =>
        pathname === "/app/host/sessions/new" || /^\/app\/host\/sessions\/[^/]+\/edit$/.test(pathname),
    },
    {
      key: "host-members",
      href: "/app/host/members",
      label: READMATES_PRIMARY_NAV_LABELS.host.members,
      current: (pathname) => pathname === "/app/host/members" || pathname === "/app/host/invitations",
    },
    {
      key: "host-records",
      href: "/app/host/sessions",
      label: READMATES_PRIMARY_NAV_LABELS.host.records,
      current: (pathname) =>
        pathname === "/app/host/sessions" ||
        /^\/app\/host\/sessions\/[^/]+\/(?:closing|feedback-document)$/.test(pathname),
    },
  ];
}

const memberReturnLink: NavLink = {
  key: "member-workspace",
  href: "/app",
  label: READMATES_WORKSPACE_LABELS.memberWorkspaceReturn,
  current: (pathname) => pathname === "/app",
};

function DefaultLink({ to, children, ...props }: AppLinkProps) {
  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

function prefixedPath(publicBasePath: string, path: string) {
  return publicBasePath ? `${publicBasePath}${path === "/" ? "" : path}` : path;
}

function prefixedAppPath(appBasePath: string, path: string) {
  return appBasePath ? `${appBasePath}${path === "/app" ? "" : path.replace(/^\/app/, "")}` : path;
}

function appPathname(pathname: string) {
  return pathname.replace(/^\/clubs\/[^/]+(?=\/app(?:\/|$))/, "");
}

function scopedAppLink(link: NavLink, appBasePath: string): NavLink {
  return {
    ...link,
    href: link.href ? prefixedAppPath(appBasePath, link.href) : null,
  };
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

function Brand({ href, LinkComponent }: { href: string; LinkComponent: AppLinkComponent }) {
  return (
    <LinkComponent to={href} className="row" style={{ gap: "10px" }}>
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
    </LinkComponent>
  );
}

function TopNavFrame({
  brandHref,
  navLabel,
  links,
  pathname,
  memberName,
  memberAvatarKey,
  workspaceAction,
  accountControl,
  LinkComponent,
}: {
  brandHref: string;
  navLabel: string;
  links: NavLink[];
  pathname: string;
  memberName?: string | null;
  memberAvatarKey?: string | null;
  workspaceAction?: NavLink | null;
  accountControl?: ReactNode;
  LinkComponent: AppLinkComponent;
}) {
  return (
    <header className="topnav">
      <div className="container topnav-inner">
        <Brand href={brandHref} LinkComponent={LinkComponent} />

        <div className="row" style={{ gap: "12px" }}>
          <nav className="nav-links" aria-label={navLabel}>
            {links.map((link) =>
              link.href ? (
                <LinkComponent
                  key={link.key}
                  to={link.href}
                  className="nav-link"
                  aria-current={link.current(pathname) ? "page" : undefined}
                >
                  {link.label}
                </LinkComponent>
              ) : link.retry ? (
                <button
                  key={link.key}
                  type="button"
                  className="nav-link is-pending"
                  aria-current={link.current(pathname) ? "page" : undefined}
                  aria-label={link.pendingAriaLabel}
                  disabled={link.retry.pending}
                  onClick={link.retry.onRetry}
                >
                  {link.pendingLabel ?? link.label}
                </button>
              ) : (
                <span
                  key={link.key}
                  className="nav-link is-pending"
                  aria-disabled="true"
                  aria-current={link.current(pathname) ? "page" : undefined}
                  aria-label={link.pendingAriaLabel ?? `${link.label} 불러오는 중`}
                >
                  {link.pendingLabel ?? link.label}
                </span>
              ),
            )}
          </nav>
          {workspaceAction || accountControl || memberName ? (
            <div className="topnav-account-actions">
              {workspaceAction ? (
                <LinkComponent
                  to={workspaceAction.href!}
                  className="rm-workspace-switch"
                  aria-label={workspaceAction.label}
                  title={workspaceAction.label}
                >
                  <WorkspaceSwitchIcon size={17} />
                </LinkComponent>
              ) : null}
              {accountControl ?? (memberName ? <AvatarChip avatarKey={memberAvatarKey} name={memberName} label="" size={28} /> : null)}
            </div>
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

function GuestTopNav({
  authenticated,
  publicBasePath = "",
  LinkComponent,
}: {
  authenticated?: boolean;
  publicBasePath?: string;
  LinkComponent: AppLinkComponent;
}) {
  const pathname = useLocation().pathname;
  const authAction = usePublicAuthAction({ href: "/login", label: READMATES_NAV_LABELS.public.login }, authenticated);
  const links = guestLinks(publicBasePath);

  return (
    <TopNavFrame
      brandHref={prefixedPath(publicBasePath, "/")}
      navLabel="공개 내비게이션"
      links={guestLinksWithAction(links, authAction)}
      pathname={pathname}
      LinkComponent={LinkComponent}
    />
  );
}

function AppTopNav({
  variant,
  memberName,
  memberAvatarKey,
  showHostEntry,
  currentSessionId,
  currentSessionStatus,
  onRetryCurrentSession,
  appBasePath = "",
  LinkComponent,
  accountControl,
}: {
  variant: Exclude<TopNavVariant, "guest">;
  memberName?: string | null;
  memberAvatarKey?: string | null;
  showHostEntry?: boolean;
  currentSessionId?: string | null;
  currentSessionStatus?: CurrentSessionNavigationStatus;
  onRetryCurrentSession?: () => void;
  appBasePath?: string;
  LinkComponent: AppLinkComponent;
  accountControl?: ReactNode;
}) {
  const pathname = useLocation().pathname;
  const appPath = appPathname(pathname);
  const resolvedCurrentSessionStatus =
    currentSessionStatus ?? (currentSessionId === undefined ? "loading" : "ready");
  const links = (
    variant === "host"
      ? hostLinks({
          currentSessionId,
          currentSessionStatus: resolvedCurrentSessionStatus,
          onRetryCurrentSession,
        })
      : memberLinks
  ).map((link) => scopedAppLink(link, appBasePath));
  const workspaceAction = variant === "host" ? memberReturnLink : showHostEntry ? hostEntryLink : null;
  const scopedWorkspaceAction = workspaceAction ? scopedAppLink(workspaceAction, appBasePath) : null;

  return (
    <TopNavFrame
      brandHref={prefixedAppPath(appBasePath, variant === "host" ? "/app/host" : "/app")}
      navLabel="앱 내비게이션"
      links={links}
      pathname={appPath}
      memberName={memberName}
      memberAvatarKey={memberAvatarKey}
      workspaceAction={scopedWorkspaceAction}
      accountControl={accountControl}
      LinkComponent={LinkComponent}
    />
  );
}

export function TopNav({
  variant = "guest",
  memberName,
  memberAvatarKey,
  showHostEntry,
  authenticated,
  publicBasePath,
  appBasePath,
  currentSessionId,
  currentSessionStatus,
  onRetryCurrentSession,
  LinkComponent = DefaultLink,
  accountControl,
}: TopNavProps) {
  if (variant === "guest") {
    return <GuestTopNav authenticated={authenticated} publicBasePath={publicBasePath} LinkComponent={LinkComponent} />;
  }

  return (
    <AppTopNav
      variant={variant}
      memberName={memberName}
      memberAvatarKey={memberAvatarKey}
      showHostEntry={showHostEntry}
      appBasePath={appBasePath}
      currentSessionId={currentSessionId}
      currentSessionStatus={currentSessionStatus}
      onRetryCurrentSession={onRetryCurrentSession}
      LinkComponent={LinkComponent}
      accountControl={accountControl}
    />
  );
}
