
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useLocation } from "react-router";
import { AvatarChip } from "./avatar-chip";
import { usePublicAuthAction, type PublicAuthAction } from "./public-auth-action-state";
import { ReadmatesBrandMark } from "./readmates-brand-mark";
import {
  READMATES_NAV_LABELS,
  READMATES_PRIMARY_NAV_LABELS,
} from "./readmates-copy";
import { WorkspaceSwitchIcon } from "./workspace-switch-icon";
import { hasHostRecordsReturnState } from "@/shared/routing/readmates-route-state";
import { HOST_ROUTE_HREFS } from "@/shared/routing/host-route-destinations";
import type { PrimaryNavigationItem } from "@/shared/model/app-club-shell";

export type TopNavVariant = "guest" | "member" | "host";

export type WorkspaceAction = {
  href: string;
  label: string;
  navigation: "push" | "replace";
};

type AppLinkProps = {
  to: string;
  replace?: boolean;
  state?: unknown;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page" | "true";
  title?: string;
  style?: CSSProperties;
};

export type AppLinkComponent = ComponentType<AppLinkProps>;

type NavLink = {
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
  current: (pathname: string) => boolean;
};

export type CurrentSessionNavigationStatus = "ready" | "loading" | "error" | "retrying";

type TopNavProps = {
  variant?: TopNavVariant;
  memberName?: string | null;
  memberAvatarKey?: string | null;
  workspaceAction?: WorkspaceAction | null;
  authenticated?: boolean;
  publicBasePath?: string;
  appBasePath?: string;
  currentSessionId?: string | null;
  currentSessionStatus?: CurrentSessionNavigationStatus;
  onRetryCurrentSession?: () => void;
  LinkComponent?: AppLinkComponent;
  accountControl?: ReactNode;
  primaryItems?: ReadonlyArray<PrimaryNavigationItem>;
  navLabel?: string;
  brandHref?: string;
  contextControl?: ReactNode;
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

function hostLinks({
  currentSessionId,
  currentSessionStatus,
  onRetryCurrentSession,
}: {
  currentSessionId?: string | null;
  currentSessionStatus: CurrentSessionNavigationStatus;
  onRetryCurrentSession?: () => void;
}): NavLink[] {
  void currentSessionId;
  void currentSessionStatus;
  void onRetryCurrentSession;

  return [
    {
      key: "host-operations",
      href: HOST_ROUTE_HREFS.today,
      label: READMATES_PRIMARY_NAV_LABELS.host.today,
      current: (pathname) => pathname === "/app/host" || pathname === "/app/host/notifications",
    },
    {
      key: "host-session",
      href: HOST_ROUTE_HREFS.meetings,
      label: READMATES_PRIMARY_NAV_LABELS.host.session,
      current: (pathname) =>
        pathname === "/app/host/sessions"
        || pathname === "/app/host/sessions/new"
        || pathname === "/app/host/records"
        || /^\/app\/host\/sessions\/[^/]+(?:\/edit)?$/.test(pathname)
        || /^\/app\/host\/sessions\/[^/]+\/(?:closing|feedback-document)$/.test(pathname),
    },
    {
      key: "host-members",
      href: HOST_ROUTE_HREFS.members,
      label: READMATES_PRIMARY_NAV_LABELS.host.members,
      current: (pathname) => pathname === "/app/host/members" || pathname === "/app/host/invitations",
    },
  ];
}

function DefaultLink({ to, replace: _replace, state: _state, children, ...props }: AppLinkProps) {
  void _replace;
  void _state;

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

function scopedWorkspaceAction(action: WorkspaceAction | null, appBasePath: string): NavLink | null {
  if (!action) {
    return null;
  }

  return {
    key: "workspace-action",
    href: action.href.startsWith("/clubs/") ? action.href : prefixedAppPath(appBasePath, action.href),
    label: action.label,
    replace: action.navigation === "replace",
    current: () => false,
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
  contextControl,
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
  contextControl?: ReactNode;
  LinkComponent: AppLinkComponent;
}) {
  return (
    <header className="topnav">
      <div className="container topnav-inner">
        <div className="topnav-global-context">
          <Brand href={brandHref} LinkComponent={LinkComponent} />
          {contextControl}
        </div>

        <div className="row" style={{ gap: "12px" }}>
          <nav className="nav-links" aria-label={navLabel}>
            {links.map((link) =>
              link.href ? (
                <LinkComponent
                  key={link.key}
                  to={link.href}
                  replace={link.replace}
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
                  replace={workspaceAction.replace}
                  className="rm-workspace-switch"
                  aria-label={workspaceAction.label}
                  title={workspaceAction.label}
                >
                  <WorkspaceSwitchIcon size={22} />
                </LinkComponent>
              ) : null}
              {accountControl ?? (memberName ? <AvatarChip avatarKey={memberAvatarKey} name={memberName} label="" sizeRole="navigation" /> : null)}
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
  workspaceAction,
  currentSessionId,
  currentSessionStatus,
  onRetryCurrentSession,
  appBasePath = "",
  LinkComponent,
  accountControl,
  primaryItems,
  navLabel,
  brandHref,
  contextControl,
}: {
  variant: Exclude<TopNavVariant, "guest">;
  memberName?: string | null;
  memberAvatarKey?: string | null;
  workspaceAction?: WorkspaceAction | null;
  currentSessionId?: string | null;
  currentSessionStatus?: CurrentSessionNavigationStatus;
  onRetryCurrentSession?: () => void;
  appBasePath?: string;
  LinkComponent: AppLinkComponent;
  accountControl?: ReactNode;
  primaryItems?: ReadonlyArray<PrimaryNavigationItem>;
  navLabel?: string;
  brandHref?: string;
  contextControl?: ReactNode;
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const rawAppPath = appPathname(pathname);
  const appPath = variant === "host"
    && /^\/app\/host\/sessions\/[^/]+(?:\/edit)?$/.test(rawAppPath)
    && hasHostRecordsReturnState(location.state, pathname)
    ? HOST_ROUTE_HREFS.meetings
    : rawAppPath;
  const resolvedCurrentSessionStatus =
    currentSessionStatus ?? (currentSessionId === undefined ? "loading" : "ready");
  const links = primaryItems
    ? primaryItems.map((item) => ({
        key: item.id,
        href: item.href,
        label: item.label,
        replace: item.navigation === "replace",
        current: () => item.current,
      }))
    : (
        variant === "host"
          ? hostLinks({
              currentSessionId,
              currentSessionStatus: resolvedCurrentSessionStatus,
              onRetryCurrentSession,
            })
          : memberLinks
      ).map((link) => scopedAppLink(link, appBasePath));
  const resolvedWorkspaceAction = workspaceAction ? scopedWorkspaceAction(workspaceAction, appBasePath) : null;

  return (
    <TopNavFrame
      brandHref={brandHref ?? prefixedAppPath(appBasePath, variant === "host" ? "/app/host" : "/app")}
      navLabel={navLabel ?? "앱 내비게이션"}
      links={links}
      pathname={appPath}
      memberName={memberName}
      memberAvatarKey={memberAvatarKey}
      workspaceAction={resolvedWorkspaceAction}
      accountControl={accountControl}
      contextControl={contextControl}
      LinkComponent={LinkComponent}
    />
  );
}

export function TopNav({
  variant = "guest",
  memberName,
  memberAvatarKey,
  workspaceAction,
  authenticated,
  publicBasePath,
  appBasePath,
  currentSessionId,
  currentSessionStatus,
  onRetryCurrentSession,
  LinkComponent = DefaultLink,
  accountControl,
  primaryItems,
  navLabel,
  brandHref,
  contextControl,
}: TopNavProps) {
  if (variant === "guest") {
    return <GuestTopNav authenticated={authenticated} publicBasePath={publicBasePath} LinkComponent={LinkComponent} />;
  }

  if (primaryItems) {
    const links: NavLink[] = primaryItems.map((item) => ({
      key: item.id,
      href: item.href,
      label: item.label,
      replace: item.navigation === "replace",
      current: () => item.current,
    }));
    const resolvedWorkspaceAction = workspaceAction
      ? scopedWorkspaceAction(workspaceAction, appBasePath ?? "")
      : null;

    return (
      <TopNavFrame
        brandHref={brandHref ?? (variant === "host" ? "/app/host" : "/app")}
        navLabel={navLabel ?? "앱 내비게이션"}
        links={links}
        pathname=""
        memberName={memberName}
        memberAvatarKey={memberAvatarKey}
        workspaceAction={resolvedWorkspaceAction}
        accountControl={accountControl}
        contextControl={contextControl}
        LinkComponent={LinkComponent}
      />
    );
  }

  return (
    <AppTopNav
      variant={variant}
      memberName={memberName}
      memberAvatarKey={memberAvatarKey}
      workspaceAction={workspaceAction}
      appBasePath={appBasePath}
      currentSessionId={currentSessionId}
      currentSessionStatus={currentSessionStatus}
      onRetryCurrentSession={onRetryCurrentSession}
      LinkComponent={LinkComponent}
      accountControl={accountControl}
      primaryItems={primaryItems}
      navLabel={navLabel}
      brandHref={brandHref}
      contextControl={contextControl}
    />
  );
}
