import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { usableJoinedClubs } from "@/features/club-selection/model/club-entry";
import { AccountMenuController } from "@/features/auth/route/account-menu-controller";
import { hostCurrentSessionQuery } from "@/features/host/queries/host-session-queries";
import { useAuth, useAuthActions } from "@/src/app/auth-state";
import {
  archiveReportReturnTarget,
  archiveSessionsReturnTarget,
  publicRecordsReturnTarget,
  readPublicReadmatesReturnTarget,
  readReadmatesReturnTarget,
  readReadmatesWorkspaceState,
  readmatesReturnState,
  readStoredReadmatesMobileWorkspace,
  rememberReadmatesMobileWorkspace,
  resetReadmatesNavigationScroll,
  type ReadmatesMobileWorkspace,
} from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { canUseHostApp } from "@/shared/auth/member-app-access";
import { MobileHeader } from "@/shared/ui/mobile-header";
import { MobileTabBar } from "@/shared/ui/mobile-tab-bar";
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

function clubSwitcherTargetPath({
  clubSlug,
  appPath,
  search,
  hash,
  canOpenHostPath,
}: {
  clubSlug: string;
  appPath: string;
  search: string;
  hash: string;
  canOpenHostPath: boolean;
}) {
  const nextAppPath = appPath.startsWith("/app/host") && !canOpenHostPath ? "/app" : appPath;
  return `/clubs/${encodeURIComponent(clubSlug)}${nextAppPath}${search}${hash}`;
}

function ClubSwitcher({
  auth,
  currentClubSlug,
  appPath,
  search,
  hash,
}: {
  auth: AuthMeResponse | null;
  currentClubSlug: string | null;
  appPath: string;
  search: string;
  hash: string;
}) {
  const navigate = useNavigate();
  const clubs = usableJoinedClubs(auth?.joinedClubs ?? []);

  if (clubs.length < 2) {
    return null;
  }

  return (
    <div className="club-switcher" aria-live="polite">
      <label className="club-switcher__label" htmlFor="club-switcher-select">
        클럽
      </label>
      <select
        id="club-switcher-select"
        aria-label="클럽 전환"
        className="club-switcher__select"
        value={currentClubSlug ?? ""}
        onChange={(event) => {
          const nextSlug = event.currentTarget.value;
          if (!nextSlug || nextSlug === currentClubSlug) {
            return;
          }
          const nextClub = clubs.find((club) => club.clubSlug === nextSlug);
          navigate(
            clubSwitcherTargetPath({
              clubSlug: nextSlug,
              appPath,
              search,
              hash,
              canOpenHostPath: nextClub?.role === "HOST" && nextClub.status === "ACTIVE",
            }),
          );
        }}
      >
        {!currentClubSlug ? <option value="">클럽 선택</option> : null}
        {clubs.map((club) => (
          <option key={club.membershipId} value={club.clubSlug}>
            {club.clubName}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AppRouteLayout({
  scopedAuth,
}: {
  scopedAuth?: AuthMeResponse;
} = {}) {
  const state = useAuth();
  const { markLoggedOut } = useAuthActions();
  const location = useLocation();
  const pathname = location.pathname;
  const appPath = appPathname(pathname);
  const basePath = appBasePath(pathname);
  const clubSlug = appClubSlug(pathname);
  const auth = clubSlug
    ? (scopedAuth ?? null)
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
  const memberAvatarKey = auth?.currentMembership?.avatarKey ?? auth?.avatarKey ?? null;
  const activeHostKey = isActiveHost && mobileWorkspace === "host" ? auth.membershipId : null;
  const currentSessionQuery = useQuery({
    ...hostCurrentSessionQuery(clubSlug ? { clubSlug } : undefined),
    enabled: activeHostKey !== null,
  });
  const [isRetryingCurrentSession, setIsRetryingCurrentSession] = useState(false);
  const currentSessionStatus =
    activeHostKey === null
      ? "ready"
      : currentSessionQuery.isFetching
        ? isRetryingCurrentSession
          ? "retrying"
          : "loading"
        : currentSessionQuery.isError
          ? "error"
          : "ready";
  const currentSessionId =
    activeHostKey === null
      ? null
      : currentSessionStatus === "ready"
        ? (currentSessionQuery.data?.currentSession?.sessionId ?? null)
        : undefined;
  const retryCurrentSession = () => {
    setIsRetryingCurrentSession(true);
    void currentSessionQuery.refetch().finally(() => {
      setIsRetryingCurrentSession(false);
    });
  };

  useEffect(() => {
    if (!isActiveHost) {
      return;
    }

    rememberReadmatesMobileWorkspace(mobileWorkspace);
  }, [isActiveHost, mobileWorkspace]);

  return (
    <div className="app-shell">
      <div className="desktop-only">
        <TopNav
          variant={desktopVariant}
          memberName={memberName}
          memberAvatarKey={memberAvatarKey}
          showHostEntry={showHostEntry}
          appBasePath={basePath}
          currentSessionId={desktopVariant === "host" ? currentSessionId : null}
          currentSessionStatus={desktopVariant === "host" ? currentSessionStatus : "ready"}
          onRetryCurrentSession={desktopVariant === "host" ? retryCurrentSession : undefined}
          LinkComponent={Link}
          accountControl={
            auth?.authenticated ? (
              <AccountMenuController
                auth={auth}
                appBasePath={basePath}
                LinkComponent={Link}
                onLoggedOut={markLoggedOut}
              />
            ) : null
          }
        />
      </div>
      <div className="mobile-only">
        <MobileHeader
          variant={mobileVariant}
          showHostEntry={showHostEntry}
          appBasePath={basePath}
          LinkComponent={Link}
          navigationContinuity={readmatesNavigationContinuity}
          accountControl={
            auth?.authenticated ? (
              <AccountMenuController
                auth={auth}
                appBasePath={basePath}
                LinkComponent={Link}
                onLoggedOut={markLoggedOut}
              />
            ) : null
          }
        />
      </div>
      <div className="app-content">
        <ClubSwitcher
          auth={auth}
          currentClubSlug={clubSlug ?? auth?.currentMembership?.clubSlug ?? null}
          appPath={appPath}
          search={location.search}
          hash={location.hash}
        />
        <RouteOutlet />
      </div>
      <div className="desktop-only">
        <PublicFooter showGuestMemberActions={false} LinkComponent={Link} />
      </div>
      <div className="mobile-only">
        <MobileTabBar
          variant={mobileVariant}
          currentSessionId={currentSessionId}
          currentSessionStatus={currentSessionStatus}
          onRetryCurrentSession={retryCurrentSession}
          appBasePath={basePath}
          LinkComponent={Link}
        />
      </div>
    </div>
  );
}
