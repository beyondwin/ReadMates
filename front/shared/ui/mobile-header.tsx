"use client";

import { useLocation } from "react-router-dom";
import {
  archiveReportReturnTarget,
  archiveSessionsReturnTarget,
  publicRecordsReturnTarget,
  readPublicReadmatesReturnTarget,
  readReadmatesReturnTarget,
  readmatesReturnState,
  type ReadmatesReturnState,
} from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";
import { usePublicAuthAction } from "./public-auth-action-state";
import { ReadmatesBrandMark } from "./readmates-brand-mark";
import { READMATES_NAV_LABELS, READMATES_WORKSPACE_LABELS } from "./readmates-copy";
import { TabIcon, type TabIconName } from "./mobile-tab-bar";
import { WorkspaceSwitchIcon } from "./workspace-switch-icon";

export type MobileHeaderVariant = "guest" | "member" | "host";

type MobileHeaderProps = {
  variant: MobileHeaderVariant;
  showHostEntry?: boolean;
  authenticated?: boolean;
};

function publicTitle(pathname: string) {
  if (pathname === "/login" || pathname.startsWith("/invite/")) {
    return READMATES_NAV_LABELS.public.login;
  }

  if (pathname === "/about") {
    return "클럽 소개";
  }

  if (pathname === "/records") {
    return READMATES_NAV_LABELS.public.publicRecords;
  }

  if (pathname.startsWith("/sessions/")) {
    return READMATES_NAV_LABELS.public.publicRecords;
  }

  return "읽는사이";
}

function appTitle(variant: Exclude<MobileHeaderVariant, "guest">, pathname: string) {
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
    return variant === "host" ? "세션" : READMATES_NAV_LABELS.host.sessionEditor;
  }

  if (pathname.startsWith("/app/host/sessions/")) {
    return variant === "host" ? "세션" : READMATES_NAV_LABELS.host.sessionEditor;
  }

  if (variant === "host" && (pathname === "/app/host/invitations" || pathname === "/app/host/members")) {
    return "멤버";
  }

  if (pathname.startsWith("/app/host")) {
    return variant === "host" ? "오늘" : READMATES_NAV_LABELS.host.operations;
  }

  if (pathname.startsWith("/app/sessions/")) {
    return "지난 세션";
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
    return READMATES_NAV_LABELS.member.notifications;
  }

  if (pathname.startsWith("/app/me")) {
    return READMATES_NAV_LABELS.member.mySpace;
  }

  return variant === "host" ? READMATES_NAV_LABELS.host.operations : "읽는사이";
}

type HeaderBackTarget = {
  href: string;
  state?: ReadmatesReturnState;
  label: string;
  icon?: TabIconName | "brand";
};

type HeaderAction = {
  href: string;
  label: string;
  ariaLabel?: string;
  icon?: "workspace-switch";
};

function appBackTarget(variant: Exclude<MobileHeaderVariant, "guest">, pathname: string, state: unknown): HeaderBackTarget | null {
  if (pathname === "/app/session" || pathname.startsWith("/app/session/")) {
    return { href: "/app", label: "홈", icon: "brand" };
  }

  if (pathname === "/app/notes") {
    return { href: "/app", label: "홈", icon: "brand" };
  }

  if (pathname.startsWith("/app/host/sessions/")) {
    return { href: "/app/host", label: "오늘", icon: "brand" };
  }

  if (pathname.startsWith("/app/feedback/") && pathname.endsWith("/print")) {
    const sourceTarget = readReadmatesReturnTarget(state, archiveReportReturnTarget);
    return {
      href: pathname.replace(/\/print$/, ""),
      state: readmatesReturnState(sourceTarget),
      label: "문서",
    };
  }

  if (pathname.startsWith("/app/feedback/")) {
    const target = readReadmatesReturnTarget(state, archiveReportReturnTarget);
    return {
      href: target.href,
      state: target.state,
      label: "뒤로",
    };
  }

  if (pathname.startsWith("/app/sessions/")) {
    const target = readReadmatesReturnTarget(state, archiveSessionsReturnTarget);
    return { href: target.href, state: target.state, label: "뒤로" };
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
}: {
  workspace: MobileHeaderVariant;
  title: string;
  kicker?: string | null;
  backTarget?: HeaderBackTarget | null;
  rightAction?: HeaderAction | null;
}) {
  const brandHref = workspace === "host" ? "/app/host" : workspace === "member" ? "/app" : "/";
  const actionTitle = rightAction?.ariaLabel ?? rightAction?.label;

  return (
    <header className={`m-hdr m-hdr--${workspace}`} data-workspace={workspace}>
      <div className="m-hdr-side m-hdr-side--left">
        {backTarget ? (
          <Link
            to={backTarget.href}
            state={backTarget.state}
            className={`m-hdr-back${backTarget.icon ? " m-hdr-back--icon" : ""}`}
            aria-label="뒤로"
            style={backTarget.icon ? { width: 44, padding: 0 } : undefined}
          >
            <HeaderBackIcon icon={backTarget.icon} />
            {backTarget.icon ? null : <span className="m-hdr-back__label">{backTarget.label}</span>}
          </Link>
        ) : (
          <Link to={brandHref} className="m-hdr-brand" aria-label="읽는사이 홈">
            <ReadmatesBrandMark />
          </Link>
        )}
      </div>
      <div className="m-hdr-heading">
        {kicker ? <div className="m-hdr-kicker">{kicker}</div> : null}
        <div className="m-hdr-title">{title}</div>
      </div>
      <div className="m-hdr-side m-hdr-side--right">
        {rightAction ? (
          <Link
            to={rightAction.href}
            className={`m-hdr-link${rightAction.icon ? " m-hdr-link--icon" : ""}`}
            aria-label={rightAction.ariaLabel}
            title={actionTitle}
          >
            {rightAction.icon === "workspace-switch" ? <WorkspaceSwitchIcon /> : rightAction.label}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function GuestMobileHeader({ authenticated }: { authenticated?: boolean }) {
  const location = useLocation();
  const pathname = location.pathname;
  const authAction = usePublicAuthAction({ href: "/login", label: READMATES_NAV_LABELS.public.login }, authenticated);
  const isEntryRoute = pathname === "/login" || pathname.startsWith("/invite/");
  const publicSessionReturnTarget = pathname.startsWith("/sessions/")
    ? readPublicReadmatesReturnTarget(location.state, publicRecordsReturnTarget)
    : null;
  const backTarget: HeaderBackTarget | null = isEntryRoute
    ? { href: "/", label: "홈" }
    : publicSessionReturnTarget
      ? { ...publicSessionReturnTarget, label: "뒤로" }
      : null;

  return (
    <HeaderShell
      workspace="guest"
      title={publicTitle(pathname)}
      backTarget={backTarget}
      rightAction={isEntryRoute ? null : authAction}
    />
  );
}

function appRightAction(variant: Exclude<MobileHeaderVariant, "guest">, showHostEntry: boolean): HeaderAction | null {
  if (variant === "host") {
    return {
      href: "/app",
      label: "멤버",
      ariaLabel: READMATES_WORKSPACE_LABELS.memberWorkspaceReturn,
      icon: "workspace-switch",
    };
  }

  if (showHostEntry) {
    return {
      href: "/app/host",
      label: "운영",
      ariaLabel: READMATES_WORKSPACE_LABELS.hostWorkspace,
      icon: "workspace-switch",
    };
  }

  return null;
}

function AppMobileHeader({
  variant,
  showHostEntry = false,
}: {
  variant: Exclude<MobileHeaderVariant, "guest">;
  showHostEntry?: boolean;
}) {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <HeaderShell
      workspace={variant}
      kicker={variant === "host" ? "호스트" : null}
      title={appTitle(variant, pathname)}
      backTarget={appBackTarget(variant, pathname, location.state)}
      rightAction={appRightAction(variant, showHostEntry)}
    />
  );
}

export function MobileHeader({ variant, showHostEntry, authenticated }: MobileHeaderProps) {
  if (variant === "guest") {
    return <GuestMobileHeader authenticated={authenticated} />;
  }

  return <AppMobileHeader variant={variant} showHostEntry={showHostEntry} />;
}
