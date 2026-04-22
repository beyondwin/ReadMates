"use client";

import { useLocation } from "react-router-dom";
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

  if (pathname.startsWith("/sessions/")) {
    return READMATES_NAV_LABELS.public.publicRecords;
  }

  return "읽는사이";
}

function appTitle(variant: Exclude<MobileHeaderVariant, "guest">, pathname: string) {
  if (pathname.startsWith("/app/host/sessions/new")) {
    return READMATES_NAV_LABELS.host.sessionEditor;
  }

  if (pathname.startsWith("/app/host/sessions/")) {
    return READMATES_NAV_LABELS.host.sessionEditor;
  }

  if (pathname.startsWith("/app/host")) {
    return READMATES_NAV_LABELS.host.operations;
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

function appBackHref(pathname: string) {
  if (pathname === "/app/notes") {
    return "/app";
  }

  if (pathname.startsWith("/app/host/sessions/")) {
    return "/app/host";
  }

  if (pathname.startsWith("/app/sessions/")) {
    return "/app/archive";
  }

  return null;
}

function HeaderShell({
  title,
  backHref,
  rightAction,
}: {
  title: string;
  backHref?: string | null;
  rightAction?: PublicAuthAction | null;
}) {
  return (
    <header className="m-hdr">
      <div style={{ width: 56, display: "flex" }}>
        {backHref ? (
          <Link to={backHref} className="m-hdr-link" aria-label="뒤로">
            뒤로
          </Link>
        ) : null}
      </div>
      <div className="m-hdr-title">{title}</div>
      <div style={{ minWidth: 56, display: "flex", justifyContent: "flex-end" }}>
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
  const pathname = useLocation().pathname;
  const authAction = usePublicAuthAction({ href: "/login", label: READMATES_NAV_LABELS.public.login });
  const isEntryRoute = pathname === "/login" || pathname.startsWith("/invite/");

  return (
    <HeaderShell
      title={publicTitle(pathname)}
      backHref={isEntryRoute ? "/" : null}
      rightAction={isEntryRoute ? null : authAction}
    />
  );
}

function appRightAction(variant: Exclude<MobileHeaderVariant, "guest">, showHostEntry: boolean): PublicAuthAction | null {
  if (variant === "host") {
    return { href: "/app", label: READMATES_WORKSPACE_LABELS.memberWorkspace };
  }

  if (showHostEntry) {
    return { href: "/app/host", label: READMATES_NAV_LABELS.host.operations };
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
  const pathname = useLocation().pathname;

  return (
    <HeaderShell
      title={appTitle(variant, pathname)}
      backHref={appBackHref(pathname)}
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
