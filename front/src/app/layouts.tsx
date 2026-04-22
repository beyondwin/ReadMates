import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/src/app/auth-state";
import type { CurrentSessionResponse } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { MobileHeader } from "@/shared/ui/mobile-header";
import { MobileTabBar } from "@/shared/ui/mobile-tab-bar";
import { PublicFooter } from "@/shared/ui/public-footer";
import { PublicMobileHeader } from "@/shared/ui/public-mobile-header";
import { TopNav } from "@/shared/ui/top-nav";

export function PublicRouteLayout() {
  return (
    <div className="public-shell m-app">
      <div className="desktop-only">
        <TopNav />
      </div>
      <div className="mobile-only">
        <PublicMobileHeader />
      </div>
      <Outlet />
      <PublicFooter />
    </div>
  );
}

export function AppRouteLayout() {
  const state = useAuth();
  const pathname = useLocation().pathname;
  const auth = state.status === "ready" ? state.auth : null;
  const isHostWorkspace = pathname.startsWith("/app/host");
  const isActiveHost = auth?.role === "HOST" && auth.approvalState === "ACTIVE";
  const variant = isHostWorkspace ? "host" : "member";
  const showHostEntry = Boolean(isActiveHost && !isHostWorkspace);
  const memberName = auth?.displayName ?? auth?.shortName ?? null;
  const activeHostKey = isActiveHost && isHostWorkspace ? auth.membershipId : null;
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

  return (
    <div className="app-shell">
      <div className="desktop-only">
        <TopNav variant={variant} memberName={memberName} showHostEntry={showHostEntry} />
      </div>
      <div className="mobile-only">
        <MobileHeader variant={variant} showHostEntry={showHostEntry} />
      </div>
      <div className="app-content">
        <Outlet />
      </div>
      <div className="desktop-only">
        <PublicFooter />
      </div>
      <div className="mobile-only">
        <MobileTabBar variant={variant} currentSessionId={currentSessionId} />
      </div>
    </div>
  );
}
