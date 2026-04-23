import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import type { CurrentSessionResponse } from "@/features/current-session/api/current-session-contracts";
import { useAuth } from "@/src/app/auth-state";
import {
  readReadmatesWorkspaceState,
  readStoredReadmatesMobileWorkspace,
  rememberReadmatesMobileWorkspace,
  resetReadmatesNavigationScroll,
  type ReadmatesMobileWorkspace,
} from "@/src/app/route-continuity";
import { readmatesFetch } from "@/shared/api/client";
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

export function PublicRouteLayout() {
  return (
    <div className="public-shell m-app">
      <div className="desktop-only">
        <TopNav />
      </div>
      <div className="mobile-only">
        <PublicMobileHeader />
      </div>
      <div className="rm-route-stage">
        <RouteOutlet />
      </div>
      <PublicFooter showGuestMemberActions={false} />
    </div>
  );
}

export function AppRouteLayout() {
  const state = useAuth();
  const location = useLocation();
  const pathname = location.pathname;
  const auth = state.status === "ready" ? state.auth : null;
  const isHostWorkspace = pathname.startsWith("/app/host");
  const isHostRecordRoute =
    pathname.startsWith("/app/archive") || pathname.startsWith("/app/sessions/") || pathname.startsWith("/app/feedback/");
  const isActiveHost = auth?.role === "HOST" && auth.approvalState === "ACTIVE";
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
  const memberName = auth?.displayName ?? auth?.shortName ?? null;
  const activeHostKey = isActiveHost && mobileWorkspace === "host" ? auth.membershipId : null;
  const [hostCurrentSession, setHostCurrentSession] = useState<{
    hostKey: string | null;
    sessionId: string | null;
  } | null>(null);
  const currentSessionId =
    activeHostKey === null ? null : hostCurrentSession?.hostKey === activeHostKey ? hostCurrentSession.sessionId : undefined;

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
        <TopNav variant={desktopVariant} memberName={memberName} showHostEntry={showHostEntry} />
      </div>
      <div className="mobile-only">
        <MobileHeader variant={mobileVariant} showHostEntry={showHostEntry} />
      </div>
      <div className="app-content">
        <RouteOutlet />
      </div>
      <div className="desktop-only">
        <PublicFooter showGuestMemberActions={false} />
      </div>
      <div className="mobile-only">
        <MobileTabBar variant={mobileVariant} currentSessionId={currentSessionId} />
      </div>
    </div>
  );
}
