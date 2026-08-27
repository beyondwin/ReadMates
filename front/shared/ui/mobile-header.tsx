
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useLocation } from "react-router";
import { usePublicAuthAction } from "./public-auth-action-state";
import { ReadmatesBrandMark } from "./readmates-brand-mark";
import { READMATES_MOBILE_TAB_LABELS, READMATES_NAV_LABELS } from "./readmates-copy";
import { TabIcon, type TabIconName } from "./mobile-tab-bar";
import { WorkspaceSwitchIcon } from "./workspace-switch-icon";
import {
  hasHostRecordsReturnState,
  readHostRecordsReturnTarget,
} from "@/shared/routing/readmates-route-state";
import { HOST_ROUTE_HREFS } from "@/shared/routing/host-route-destinations";
import type { ClubShellBackTarget } from "@/shared/model/app-club-shell";

export type MobileHeaderVariant = "guest" | "member" | "host";

export type MobileWorkspaceAction = {
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
  title?: string;
  style?: CSSProperties;
};

export type AppLinkComponent = ComponentType<AppLinkProps>;

export type ReadmatesReturnState = {
  readmatesReturnTo: string;
  readmatesReturnLabel: string;
  readmatesReturnState?: ReadmatesReturnState;
};

type ReadmatesReturnTarget = {
  href: string;
  label: string;
  state?: ReadmatesReturnState;
};

type ReadmatesNavigationContinuity = {
  archiveReportReturnTarget: ReadmatesReturnTarget;
  archiveSessionsReturnTarget: ReadmatesReturnTarget;
  publicRecordsReturnTarget: ReadmatesReturnTarget;
  readPublicReadmatesReturnTarget: (state: unknown, fallback: ReadmatesReturnTarget) => ReadmatesReturnTarget;
  readReadmatesReturnTarget: (state: unknown, fallback: ReadmatesReturnTarget) => ReadmatesReturnTarget;
  readmatesReturnState: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
};

type MobileHeaderProps = {
  variant: MobileHeaderVariant;
  workspaceAction?: MobileWorkspaceAction | null;
  authenticated?: boolean;
  publicBasePath?: string;
  appBasePath?: string;
  LinkComponent?: AppLinkComponent;
  navigationContinuity?: ReadmatesNavigationContinuity;
  accountControl?: ReactNode;
  presentation?: {
    title: string;
    kicker?: string | null;
    backTarget?: ClubShellBackTarget | null;
    brandHref: string;
  };
};

const defaultArchiveSessionsReturnTarget: ReadmatesReturnTarget = {
  href: "/app/archive?view=sessions",
  label: "아카이브로",
};
const defaultArchiveReportReturnTarget: ReadmatesReturnTarget = {
  href: "/app/archive?view=report",
  label: "아카이브로 돌아가기",
};
const defaultPublicRecordsReturnTarget: ReadmatesReturnTarget = {
  href: "/records",
  label: "공개 기록",
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

type ReadmatesRouteState = {
  readmatesReturnTo?: unknown;
  readmatesReturnLabel?: unknown;
  readmatesReturnState?: unknown;
};

function toSafeReadmatesHref(value: string, scope: "app" | "public") {
  try {
    const base = typeof window === "undefined" ? "https://readmates.local" : window.location.origin;
    const url = new URL(value, base);

    if (url.origin !== base) {
      return null;
    }

    const isAppHref =
      url.pathname === "/app" ||
      url.pathname.startsWith("/app/") ||
      /^\/clubs\/[^/]+\/app(?:\/|$)/.test(url.pathname);
    const isPublicHref = url.pathname === "/" || url.pathname === "/records" || url.pathname.startsWith("/sessions/");

    if ((scope === "app" && !isAppHref) || (scope === "public" && !isPublicHref)) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function defaultReadmatesReturnState(target: ReadmatesReturnTarget) {
  const state: ReadmatesReturnState = {
    readmatesReturnTo: target.href,
    readmatesReturnLabel: target.label,
  };

  if (target.state) {
    state.readmatesReturnState = target.state;
  }

  return state;
}

function readReturnTargetFromState(
  state: unknown,
  scope: "app" | "public",
  visited = new Set<object>(),
  depth = 0,
): ReadmatesReturnTarget | null {
  if (depth >= 8 || !state || typeof state !== "object" || visited.has(state)) {
    return null;
  }
  visited.add(state);

  const routeState = state as ReadmatesRouteState;
  const href = typeof routeState.readmatesReturnTo === "string" ? toSafeReadmatesHref(routeState.readmatesReturnTo, scope) : null;

  if (!href) {
    return null;
  }

  const nestedTarget = readReturnTargetFromState(
    routeState.readmatesReturnState,
    scope,
    visited,
    depth + 1,
  );

  return {
    href,
    label: typeof routeState.readmatesReturnLabel === "string" ? routeState.readmatesReturnLabel : "",
    ...(nestedTarget ? { state: defaultReadmatesReturnState(nestedTarget) } : {}),
  };
}

function defaultReadReturnTarget(state: unknown, fallback: ReadmatesReturnTarget, scope: "app" | "public") {
  const target = readReturnTargetFromState(state, scope);

  if (!target) {
    return fallback;
  }

  return {
    ...target,
    label: target.label || fallback.label,
  };
}

const defaultNavigationContinuity: ReadmatesNavigationContinuity = {
  archiveReportReturnTarget: defaultArchiveReportReturnTarget,
  archiveSessionsReturnTarget: defaultArchiveSessionsReturnTarget,
  publicRecordsReturnTarget: defaultPublicRecordsReturnTarget,
  readPublicReadmatesReturnTarget: (state, fallback) => defaultReadReturnTarget(state, fallback, "public"),
  readReadmatesReturnTarget: (state, fallback) => defaultReadReturnTarget(state, fallback, "app"),
  readmatesReturnState: defaultReadmatesReturnState,
};

function prefixedPath(publicBasePath: string, path: string) {
  return publicBasePath ? `${publicBasePath}${path === "/" ? "" : path}` : path;
}

function prefixedAppPath(appBasePath: string, path: string) {
  return appBasePath ? `${appBasePath}${path === "/app" ? "" : path.replace(/^\/app/, "")}` : path;
}

function appPathname(pathname: string) {
  return pathname.replace(/^\/clubs\/[^/]+(?=\/app(?:\/|$))/, "");
}

function scopeAppBackTarget(target: HeaderBackTarget | null, appBasePath: string): HeaderBackTarget | null {
  if (!target || !target.href.startsWith("/app")) {
    return target;
  }

  return { ...target, href: prefixedAppPath(appBasePath, target.href) };
}

function publicTitle(pathname: string, publicBasePath = "") {
  if (pathname === "/login" || pathname.startsWith("/invite/") || pathname.startsWith(prefixedPath(publicBasePath, "/invite/"))) {
    return READMATES_NAV_LABELS.public.login;
  }

  if (pathname === prefixedPath(publicBasePath, "/about")) {
    return "클럽 소개";
  }

  if (pathname === prefixedPath(publicBasePath, "/records")) {
    return READMATES_NAV_LABELS.public.publicRecords;
  }

  if (pathname.startsWith(prefixedPath(publicBasePath, "/sessions/"))) {
    return READMATES_NAV_LABELS.public.publicRecords;
  }

  return "읽는사이";
}

function appTitle(variant: Exclude<MobileHeaderVariant, "guest">, pathname: string) {
  if (variant === "host" && pathname === "/app/host/records") {
    return "모임";
  }

  if (variant === "host" && pathname === "/app/host/sessions") {
    return "모임";
  }

  if (
    variant === "host" &&
    (pathname.startsWith("/app/archive") || pathname.startsWith("/app/sessions/") || pathname.startsWith("/app/feedback/"))
  ) {
    return "기록";
  }

  if (pathname.startsWith("/app/feedback/")) {
    return "피드백 문서";
  }

  if (pathname.startsWith("/app/host/sessions/new")) {
    return variant === "host" ? "모임" : READMATES_NAV_LABELS.host.sessionEditor;
  }

  if (pathname.startsWith("/app/host/sessions/")) {
    return variant === "host" ? "모임" : READMATES_NAV_LABELS.host.sessionEditor;
  }

  if (variant === "host" && pathname === "/app/host/notifications") {
    return READMATES_MOBILE_TAB_LABELS.hostNotifications;
  }

  if (variant === "host" && (pathname === "/app/host/invitations" || pathname === "/app/host/members")) {
    return "멤버";
  }

  if (pathname.startsWith("/app/host")) {
    return variant === "host" ? "오늘" : READMATES_NAV_LABELS.host.operations;
  }

  if (pathname.startsWith("/app/sessions/")) {
    return "지난 모임";
  }

  if (pathname === "/app/session" || pathname.startsWith("/app/session/")) {
    return READMATES_NAV_LABELS.member.currentSession;
  }

  if (pathname === "/app/notes") {
    return READMATES_NAV_LABELS.member.clubNotes;
  }

  if (pathname.startsWith("/app/archive")) {
    return READMATES_NAV_LABELS.member.archive;
  }

  if (pathname.startsWith("/app/notifications")) {
    return READMATES_NAV_LABELS.member.mySpace;
  }

  if (pathname.startsWith("/app/me")) {
    return READMATES_NAV_LABELS.member.mySpace;
  }

  return variant === "host" ? READMATES_NAV_LABELS.host.operations : "읽는사이";
}

function isHostRecordOwnedRoute(pathname: string, state: unknown, currentPathname = pathname) {
  return /^\/app\/host\/sessions\/[^/]+\/(?:closing|feedback-document)$/.test(pathname)
    || (/^\/app\/host\/sessions\/[^/]+(?:\/edit)?$/.test(pathname)
      && hasHostRecordsReturnState(state, currentPathname));
}

type HeaderBackTarget = {
  href: string;
  state?: unknown;
  label: string;
  icon?: TabIconName | "brand";
};

type HeaderAction = {
  href: string;
  label: string;
  replace?: boolean;
  ariaLabel?: string;
  icon?: "workspace-switch";
};

function appBackTarget(
  variant: Exclude<MobileHeaderVariant, "guest">,
  pathname: string,
  state: unknown,
  navigationContinuity: ReadmatesNavigationContinuity,
  currentPathname = pathname,
): HeaderBackTarget | null {
  if (pathname === "/app/session" || pathname.startsWith("/app/session/")) {
    return { href: "/app", label: "홈", icon: "brand" };
  }

  if (pathname === "/app/notes") {
    return { href: "/app", label: "홈", icon: "brand" };
  }

  if (pathname === "/app/host/sessions") {
    return null;
  }

  if (pathname === "/app/host/records") {
    return null;
  }

  if (variant === "host" && isHostRecordOwnedRoute(pathname, state, currentPathname)) {
    const target = readHostRecordsReturnTarget(state, currentPathname) ?? {
      href: HOST_ROUTE_HREFS.meetings,
      label: "모임으로",
    };
    return { href: target.href, state: target.state, label: "뒤로", icon: "brand" };
  }

  if (pathname.startsWith("/app/host/sessions/")) {
    return { href: "/app/host/sessions", label: "모임", icon: "brand" };
  }

  if (pathname.startsWith("/app/feedback/") && pathname.endsWith("/print")) {
    const sourceTarget = navigationContinuity.readReadmatesReturnTarget(
      state,
      navigationContinuity.archiveReportReturnTarget,
    );
    return {
      href: pathname.replace(/\/print$/, ""),
      state: navigationContinuity.readmatesReturnState(sourceTarget),
      label: "문서",
    };
  }

  if (pathname.startsWith("/app/feedback/")) {
    const target = navigationContinuity.readReadmatesReturnTarget(state, navigationContinuity.archiveReportReturnTarget);
    return {
      href: target.href,
      state: target.state,
      label: "뒤로",
    };
  }

  if (pathname.startsWith("/app/sessions/")) {
    const target = navigationContinuity.readReadmatesReturnTarget(state, navigationContinuity.archiveSessionsReturnTarget);
    return { href: target.href, state: target.state, label: "뒤로" };
  }

  if (
    pathname === "/app/me/records" ||
    pathname === "/app/me/settings" ||
    pathname === "/app/notifications" ||
    pathname === "/app/notifications/settings"
  ) {
    return { href: "/app/me", label: "뒤로" };
  }

  return null;
}

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 19 8 12l7-7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeaderBackIcon({ icon }: { icon: HeaderBackTarget["icon"] }) {
  if (icon === "brand") {
    return <ReadmatesBrandMark />;
  }

  if (icon) {
    return <TabIcon name={icon} />;
  }

  return <ChevronLeftIcon />;
}

function HeaderShell({
  workspace,
  title,
  kicker,
  backTarget,
  rightAction,
  accountControl,
  brandHref,
  LinkComponent,
}: {
  workspace: MobileHeaderVariant;
  title: string;
  kicker?: string | null;
  backTarget?: HeaderBackTarget | null;
  rightAction?: HeaderAction | null;
  accountControl?: ReactNode;
  brandHref?: string;
  LinkComponent: AppLinkComponent;
}) {
  const resolvedBrandHref = brandHref ?? (workspace === "host" ? "/app/host" : workspace === "member" ? "/app" : "/");
  const actionTitle = rightAction?.ariaLabel ?? rightAction?.label;

  return (
    <header className={`m-hdr m-hdr--${workspace}`} data-workspace={workspace}>
      <div className="m-hdr-side m-hdr-side--left">
        {backTarget ? (
          <LinkComponent
            to={backTarget.href}
            state={backTarget.state}
            className={`m-hdr-back${backTarget.icon ? " m-hdr-back--icon" : ""}`}
            aria-label="뒤로"
            style={backTarget.icon ? { width: 44, padding: 0 } : undefined}
          >
            <HeaderBackIcon icon={backTarget.icon} />
            {backTarget.icon ? null : <span className="m-hdr-back__label">{backTarget.label}</span>}
          </LinkComponent>
        ) : (
          <LinkComponent to={resolvedBrandHref} className="m-hdr-brand" aria-label="읽는사이 홈">
            <ReadmatesBrandMark />
          </LinkComponent>
        )}
      </div>
      <div className="m-hdr-heading">
        {kicker ? <div className="m-hdr-kicker">{kicker}</div> : null}
        <div className="m-hdr-title">{title}</div>
      </div>
      <div className="m-hdr-side m-hdr-side--right">
        {rightAction ? (
          <LinkComponent
            to={rightAction.href}
            replace={rightAction.replace}
            className={`m-hdr-link${rightAction.icon ? " m-hdr-link--icon" : ""}`}
            aria-label={rightAction.ariaLabel}
            title={actionTitle}
          >
            {rightAction.icon === "workspace-switch" ? <WorkspaceSwitchIcon /> : rightAction.label}
          </LinkComponent>
        ) : null}
        {accountControl}
      </div>
    </header>
  );
}

function GuestMobileHeader({
  authenticated,
  publicBasePath = "",
  LinkComponent,
  navigationContinuity,
}: {
  authenticated?: boolean;
  publicBasePath?: string;
  LinkComponent: AppLinkComponent;
  navigationContinuity: ReadmatesNavigationContinuity;
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const authAction = usePublicAuthAction({ href: "/login", label: READMATES_NAV_LABELS.public.login }, authenticated);
  const homeHref = prefixedPath(publicBasePath, "/");
  const recordsHref = prefixedPath(publicBasePath, "/records");
  const isEntryRoute = pathname === "/login" || pathname.startsWith("/invite/") || pathname.startsWith(prefixedPath(publicBasePath, "/invite/"));
  const publicSessionReturnTarget = pathname.startsWith(prefixedPath(publicBasePath, "/sessions/"))
    ? navigationContinuity.readPublicReadmatesReturnTarget(location.state, {
        ...navigationContinuity.publicRecordsReturnTarget,
        href: recordsHref,
      })
    : null;
  const backTarget: HeaderBackTarget | null = isEntryRoute
    ? { href: homeHref, label: "홈" }
    : publicSessionReturnTarget
      ? { ...publicSessionReturnTarget, label: "뒤로" }
      : null;

  return (
    <HeaderShell
      workspace="guest"
      title={publicTitle(pathname, publicBasePath)}
      backTarget={backTarget}
      rightAction={isEntryRoute ? null : authAction}
      brandHref={homeHref}
      LinkComponent={LinkComponent}
    />
  );
}

function appRightAction(
  appBasePath: string,
  workspaceAction?: MobileWorkspaceAction | null,
): HeaderAction | null {
  if (workspaceAction) {
    return {
      href: workspaceAction.href.startsWith("/clubs/") ? workspaceAction.href : prefixedAppPath(appBasePath, workspaceAction.href),
      label: workspaceAction.label,
      replace: workspaceAction.navigation === "replace",
      ariaLabel: workspaceAction.label,
      icon: "workspace-switch",
    };
  }

  return null;
}

function AppMobileHeader({
  variant,
  workspaceAction,
  appBasePath = "",
  LinkComponent,
  navigationContinuity,
  accountControl,
  presentation,
}: {
  variant: Exclude<MobileHeaderVariant, "guest">;
  workspaceAction?: MobileWorkspaceAction | null;
  appBasePath?: string;
  LinkComponent: AppLinkComponent;
  navigationContinuity: ReadmatesNavigationContinuity;
  accountControl?: ReactNode;
  presentation?: MobileHeaderProps["presentation"];
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const appPath = appPathname(pathname);
  const recordOwned = variant === "host" && isHostRecordOwnedRoute(appPath, location.state, pathname);

  return (
    <HeaderShell
      workspace={variant}
      kicker={presentation?.kicker ?? (variant === "host" ? "호스트" : null)}
      title={presentation?.title ?? (recordOwned ? "모임" : appTitle(variant, appPath))}
      backTarget={presentation
        ? (presentation.backTarget as HeaderBackTarget | null | undefined)
        : scopeAppBackTarget(
            appBackTarget(variant, appPath, location.state, navigationContinuity, pathname),
            appBasePath,
          )}
      rightAction={appRightAction(appBasePath, workspaceAction)}
      accountControl={accountControl}
      brandHref={presentation?.brandHref ?? prefixedAppPath(appBasePath, variant === "host" ? "/app/host" : "/app")}
      LinkComponent={LinkComponent}
    />
  );
}

export function MobileHeader({
  variant,
  workspaceAction,
  authenticated,
  publicBasePath,
  appBasePath,
  LinkComponent = DefaultLink,
  navigationContinuity = defaultNavigationContinuity,
  accountControl,
  presentation,
}: MobileHeaderProps) {
  if (variant === "guest") {
    return (
      <GuestMobileHeader
        authenticated={authenticated}
        publicBasePath={publicBasePath}
        LinkComponent={LinkComponent}
        navigationContinuity={navigationContinuity}
      />
    );
  }

  if (presentation) {
    return (
      <HeaderShell
        workspace={variant}
        kicker={presentation.kicker}
        title={presentation.title}
        backTarget={presentation.backTarget as HeaderBackTarget | null | undefined}
        rightAction={appRightAction(appBasePath ?? "", workspaceAction)}
        accountControl={accountControl}
        brandHref={presentation.brandHref}
        LinkComponent={LinkComponent}
      />
    );
  }

  return (
    <AppMobileHeader
      variant={variant}
      workspaceAction={workspaceAction}
      appBasePath={appBasePath}
      LinkComponent={LinkComponent}
      navigationContinuity={navigationContinuity}
      accountControl={accountControl}
      presentation={presentation}
    />
  );
}
