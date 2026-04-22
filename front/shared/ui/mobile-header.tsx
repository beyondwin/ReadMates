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
import { usePublicAuthAction, type PublicAuthAction } from "./public-auth-action-state";
import { READMATES_NAV_LABELS, READMATES_WORKSPACE_LABELS } from "./readmates-copy";

export type MobileHeaderVariant = "guest" | "member" | "host";

type MobileHeaderProps = {
  variant: MobileHeaderVariant;
  showHostEntry?: boolean;
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

  if (pathname.startsWith("/app/session")) {
    return READMATES_NAV_LABELS.member.currentSession;
  }

  if (pathname === "/app/notes") {
    return READMATES_NAV_LABELS.member.clubNotes;
  }

  if (pathname.startsWith("/app/archive")) {
    return READMATES_NAV_LABELS.member.archive;
  }

  if (pathname.startsWith("/app/me")) {
    return READMATES_NAV_LABELS.member.mySpace;
  }

  return variant === "host" ? READMATES_NAV_LABELS.host.operations : "읽는사이";
}

type AppBackTarget = {
  href: string;
  state?: ReadmatesReturnState;
};

function appBackTarget(pathname: string, state: unknown): AppBackTarget | null {
  if (pathname === "/app/notes") {
    return { href: "/app" };
  }

  if (pathname.startsWith("/app/host/sessions/")) {
    return { href: "/app/host" };
  }

  if (pathname.startsWith("/app/feedback/") && pathname.endsWith("/print")) {
    const sourceTarget = readReadmatesReturnTarget(state, archiveReportReturnTarget);
    return {
      href: pathname.replace(/\/print$/, ""),
      state: readmatesReturnState(sourceTarget),
    };
  }

  if (pathname.startsWith("/app/feedback/")) {
    const target = readReadmatesReturnTarget(state, archiveReportReturnTarget);
    return { href: target.href, state: target.state };
  }

  if (pathname.startsWith("/app/sessions/")) {
    const target = readReadmatesReturnTarget(state, archiveSessionsReturnTarget);
    return { href: target.href, state: target.state };
  }

  return null;
}

function HeaderShell({
  title,
  backTarget,
  rightAction,
}: {
  title: string;
  backTarget?: AppBackTarget | null;
  rightAction?: PublicAuthAction | null;
}) {
  return (
    <header className="m-hdr">
      <div className="m-hdr-side">
        {backTarget ? (
          <Link to={backTarget.href} state={backTarget.state} className="m-hdr-link" aria-label="뒤로">
            뒤로
          </Link>
        ) : null}
      </div>
      <div className="m-hdr-title">{title}</div>
      <div className="m-hdr-side m-hdr-side--right">
        {rightAction ? (
          <Link to={rightAction.href} className="m-hdr-link">
            {rightAction.label}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function GuestMobileHeader() {
  const location = useLocation();
  const pathname = location.pathname;
  const authAction = usePublicAuthAction({ href: "/login", label: READMATES_NAV_LABELS.public.login });
  const isEntryRoute = pathname === "/login" || pathname.startsWith("/invite/");
  const publicSessionReturnTarget = pathname.startsWith("/sessions/")
    ? readPublicReadmatesReturnTarget(location.state, publicRecordsReturnTarget)
    : null;

  return (
    <HeaderShell
      title={publicTitle(pathname)}
      backTarget={isEntryRoute ? { href: "/" } : publicSessionReturnTarget}
      rightAction={isEntryRoute ? null : authAction}
    />
  );
}

function appRightAction(variant: Exclude<MobileHeaderVariant, "guest">, showHostEntry: boolean): PublicAuthAction | null {
  if (variant === "host") {
    return { href: "/app", label: READMATES_WORKSPACE_LABELS.memberWorkspaceReturn };
  }

  if (showHostEntry) {
    return { href: "/app/host", label: READMATES_WORKSPACE_LABELS.hostWorkspace };
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
      title={appTitle(variant, pathname)}
      backTarget={appBackTarget(pathname, location.state)}
      rightAction={appRightAction(variant, showHostEntry)}
    />
  );
}

export function MobileHeader({ variant, showHostEntry }: MobileHeaderProps) {
  if (variant === "guest") {
    return <GuestMobileHeader />;
  }

  return <AppMobileHeader variant={variant} showHostEntry={showHostEntry} />;
}
