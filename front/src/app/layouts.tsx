import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import type { CurrentSessionResponse } from "@/features/current-session/api/current-session-contracts";
import { useAuth } from "@/src/app/auth-state";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { authMePath } from "@/shared/auth/member-app-loader";
import {
  readReadmatesWorkspaceState,
  readStoredReadmatesMobileWorkspace,
  rememberReadmatesMobileWorkspace,
  resetReadmatesNavigationScroll,
  type ReadmatesMobileWorkspace,
} from "@/src/app/route-continuity";
import { readmatesFetch } from "@/shared/api/client";
import { PublicUrlPolicyHead } from "@/features/public/ui/public-url-policy-head";
import { canUseHostApp } from "@/shared/auth/member-app-access";
import { MobileHeader } from "@/shared/ui/mobile-header";
import { MobileTabBar } from "@/shared/ui/mobile-tab-bar";
import { PublicFooter } from "@/shared/ui/public-footer";
import { PublicMobileHeader } from "@/shared/ui/public-mobile-header";
import { TopNav } from "@/shared/ui/top-nav";

function RouteOutlet() {
  const location = useLocation();

  useEffect(() => {
    resetReadmatesNavigationScroll();
  }, [location.pathname, location.search]);

  // CSS-only route reveal keeps browser snapshots from duplicating persistent chrome.
  return (
    <div key={location.pathname} className="rm-route-reveal">
      <Outlet />
    </div>
  );
}

function publicBasePath(pathname: string) {
  const match = /^\/clubs\/([^/]+)/.exec(pathname);
  return match ? `/clubs/${encodeURIComponent(match[1])}` : "";
}

function appPathname(pathname: string) {
  return pathname.replace(/^\/clubs\/[^/]+(?=\/app(?:\/|$))/, "");
}

function appBasePath(pathname: string) {
  const match = /^\/clubs\/([^/]+)\/app(?:\/|$)/.exec(pathname);
  return match ? `/clubs/${encodeURIComponent(match[1])}/app` : "";
}

function appClubSlug(pathname: string) {
  const match = /^\/clubs\/([^/]+)\/app(?:\/|$)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function PublicRouteLayout() {
  const state = useAuth();
  const location = useLocation();
  const authenticated = state.status === "ready" ? state.auth.authenticated : undefined;
  const basePath = publicBasePath(location.pathname);

  return (
    <div className="public-shell m-app">
      <PublicUrlPolicyHead path={location.pathname} />
      <div className="desktop-only">
        <TopNav authenticated={authenticated} publicBasePath={basePath} />
      </div>
      <div className="mobile-only">
        <PublicMobileHeader authenticated={authenticated} publicBasePath={basePath} />
      </div>
      <div className="rm-route-stage">
        <RouteOutlet />
      </div>
      <PublicFooter publicBasePath={basePath} showGuestMemberActions={false} />
    </div>
  );
}

export function AppRouteLayout() {
  const state = useAuth();
  const location = useLocation();
  const pathname = location.pathname;
  const appPath = appPathname(pathname);
  const basePath = appBasePath(pathname);
  const clubSlug = appClubSlug(pathname);
  const [scopedAuth, setScopedAuth] = useState<{ clubSlug: string; auth: AuthMeResponse | null } | null>(null);
  const auth = clubSlug
    ? scopedAuth?.clubSlug === clubSlug
      ? scopedAuth.auth
      : null
    : state.status === "ready"
      ? state.auth
      : null;
  const isHostWorkspace = appPath.startsWith("/app/host");
  const isHostRecordRoute =
    appPath.startsWith("/app/archive") || appPath.startsWith("/app/sessions/") || appPath.startsWith("/app/feedback/");
  const isActiveHost = auth ? canUseHostApp(auth) : false;
  const desktopVariant = isHostWorkspace ? "host" : "member";
  const explicitWorkspace = readReadmatesWorkspaceState(location.state);
  const storedWorkspace = readStoredReadmatesMobileWorkspace();
  const mobileWorkspace: ReadmatesMobileWorkspace =
    isActiveHost && isHostWorkspace
      ? "host"
      : isActiveHost && isHostRecordRoute
        ? (explicitWorkspace ?? storedWorkspace ?? "host")
        : "member";
  const mobileVariant = mobileWorkspace;
  const showHostEntry = Boolean(isActiveHost && !isHostWorkspace);
  const memberName = auth?.displayName ?? null;
  const activeHostKey = isActiveHost && mobileWorkspace === "host" ? auth.membershipId : null;
  const [hostCurrentSession, setHostCurrentSession] = useState<{
    hostKey: string | null;
    sessionId: string | null;
  } | null>(null);
  const currentSessionId =
    activeHostKey === null ? null : hostCurrentSession?.hostKey === activeHostKey ? hostCurrentSession.sessionId : undefined;

  useEffect(() => {
    let cancelled = false;

    if (!clubSlug) {
      return;
    }

    readmatesFetch<AuthMeResponse>(authMePath(clubSlug))
      .then((nextAuth) => {
        if (!cancelled) {
          setScopedAuth({ clubSlug, auth: nextAuth });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScopedAuth({ clubSlug, auth: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clubSlug]);

  useEffect(() => {
    let cancelled = false;

    if (activeHostKey === null) {
      return;
    }

    readmatesFetch<CurrentSessionResponse>("/api/sessions/current")
      .then((current) => {
        if (!cancelled) {
          setHostCurrentSession({
            hostKey: activeHostKey,
            sessionId: current.currentSession?.sessionId ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHostCurrentSession({
            hostKey: activeHostKey,
            sessionId: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeHostKey]);

  useEffect(() => {
    if (!isActiveHost) {
      return;
    }

    rememberReadmatesMobileWorkspace(mobileWorkspace);
  }, [isActiveHost, mobileWorkspace]);

  return (
    <div className="app-shell">
      <div className="desktop-only">
        <TopNav variant={desktopVariant} memberName={memberName} showHostEntry={showHostEntry} appBasePath={basePath} />
      </div>
      <div className="mobile-only">
        <MobileHeader variant={mobileVariant} showHostEntry={showHostEntry} appBasePath={basePath} />
      </div>
      <div className="app-content">
        <RouteOutlet />
      </div>
      <div className="desktop-only">
        <PublicFooter showGuestMemberActions={false} />
      </div>
      <div className="mobile-only">
        <MobileTabBar variant={mobileVariant} currentSessionId={currentSessionId} appBasePath={basePath} />
      </div>
    </div>
  );
}
