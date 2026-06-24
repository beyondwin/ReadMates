import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  archiveReportReturnTarget,
  archiveSessionsReturnTarget,
  publicRecordsReturnTarget,
  readPublicReadmatesReturnTarget,
  readReadmatesReturnTarget,
  readmatesReturnState,
  resetReadmatesNavigationScroll,
} from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";
import { PublicUrlPolicyHead } from "@/features/public/ui/public-url-policy-head";
import { useAuth } from "@/src/app/auth-state";
import { MobileHeader } from "@/shared/ui/mobile-header";
import { PublicFooter } from "@/shared/ui/public-footer";
import { TopNav } from "@/shared/ui/top-nav";

const readmatesNavigationContinuity = {
  archiveReportReturnTarget,
  archiveSessionsReturnTarget,
  publicRecordsReturnTarget,
  readPublicReadmatesReturnTarget,
  readReadmatesReturnTarget,
  readmatesReturnState,
};

function RouteOutlet() {
  const location = useLocation();

  useEffect(() => {
    resetReadmatesNavigationScroll();
  }, [location.pathname, location.search]);

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

export function PublicRouteLayout() {
  const state = useAuth();
  const location = useLocation();
  const authenticated = state.status === "ready" ? state.auth.authenticated : undefined;
  const basePath = publicBasePath(location.pathname);

  return (
    <div className="public-shell m-app">
      <PublicUrlPolicyHead path={location.pathname} />
      <div className="desktop-only">
        <TopNav authenticated={authenticated} publicBasePath={basePath} LinkComponent={Link} />
      </div>
      <div className="mobile-only">
        <MobileHeader
          variant="guest"
          authenticated={authenticated}
          publicBasePath={basePath}
          LinkComponent={Link}
          navigationContinuity={readmatesNavigationContinuity}
        />
      </div>
      <div className="rm-route-stage">
        <RouteOutlet />
      </div>
      <PublicFooter publicBasePath={basePath} showGuestMemberActions={false} LinkComponent={Link} />
    </div>
  );
}
