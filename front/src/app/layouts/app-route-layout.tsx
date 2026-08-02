import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "react-router";
import { logout } from "@/features/auth/api/auth-api";
import { SessionExpiryRecovery } from "@/features/auth/ui/session-expiry-recovery";
import { usableJoinedClubs } from "@/features/club-selection/model/club-entry";
import { AccountMenuController } from "@/features/auth/route/account-menu-controller";
import { GuestNavigationLink } from "@/features/guest-browse/ui/guest-navigation-dialog";
import type { ClubAppAudience } from "@/features/guest-browse/model/club-app-audience";
import { guestNavigationCapability } from "@/features/guest-browse/model/club-app-audience";
import {
  fetchGuestArchive,
  fetchGuestArchiveDetail,
  fetchGuestBrowseShell,
  fetchGuestCurrentSession,
  fetchGuestNoteFeed,
  fetchGuestNoteSessions,
  fetchGuestUpcomingSessions,
  type GuestBrowsePage,
} from "@/features/guest-browse/api/guest-browse-api";
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
import { loginPathForReturnTo } from "@/shared/auth/login-return";
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

type GuestContinuationTarget = {
  pathname: string;
  search: string;
  hash: string;
  href: string;
};

function normalizedGuestContinuationTarget(
  pathname: string,
  search: string,
  hash: string,
): GuestContinuationTarget {
  const url = new URL(`${pathname}${search}${hash}`, "https://readmates.local");
  return {
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    href: `${url.pathname}${url.search}${url.hash}`,
  };
}

function guestPageFromSearch(search: string): GuestBrowsePage | undefined {
  const params = new URLSearchParams(search);
  const cursor = params.get("cursor");
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? undefined : Number(rawLimit);

  return cursor || limit !== undefined ? { cursor, limit } : undefined;
}

async function verifyGuestReadableRoute(clubSlug: string, target: GuestContinuationTarget) {
  await fetchGuestBrowseShell(clubSlug);
  const path = appPathname(target.pathname);
  const page = guestPageFromSearch(target.search);

  if (path === "/app") {
    await Promise.all([
      fetchGuestCurrentSession(clubSlug),
      fetchGuestUpcomingSessions(clubSlug, page),
      fetchGuestNoteFeed(clubSlug, page),
    ]);
    return;
  }
  if (path === "/app/session/current") {
    await fetchGuestCurrentSession(clubSlug);
    return;
  }
  if (path === "/app/notes") {
    const sessionId = new URLSearchParams(target.search).get("sessionId");
    await Promise.all([
      fetchGuestNoteSessions(clubSlug, page),
      fetchGuestNoteFeed(clubSlug, page),
      ...(sessionId ? [fetchGuestArchiveDetail(clubSlug, sessionId)] : []),
    ]);
    return;
  }
  if (path === "/app/archive") {
    await fetchGuestArchive(clubSlug, page);
    return;
  }

  const detailMatch = /^\/app\/sessions\/([^/]+)$/.exec(path);
  if (detailMatch) {
    await fetchGuestArchiveDetail(clubSlug, decodeURIComponent(detailMatch[1]));
    return;
  }

  throw new Error("Guest continuation route is not verifiable.");
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
  audience,
}: {
  scopedAuth?: AuthMeResponse;
  audience?: ClubAppAudience;
} = {}) {
  const state = useAuth();
  const { markLoggedOut } = useAuthActions();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const appPath = appPathname(pathname);
  const guestTarget = useMemo(
    () => normalizedGuestContinuationTarget(location.pathname, location.search, location.hash),
    [location.hash, location.pathname, location.search],
  );
  const returnTo = guestTarget.href;
  const basePath = appBasePath(pathname);
  const clubSlug = appClubSlug(pathname);
  const auth = clubSlug
    ? (scopedAuth ?? null)
    : state.status === "ready"
      ? state.auth
      : null;
  const isGuestAudience = audience === "GUEST";
  const AppLinkComponent = isGuestAudience ? GuestNavigationLink : Link;
  const isHostWorkspace = appPath.startsWith("/app/host");
  const isHostRecordRoute =
    appPath.startsWith("/app/archive") || appPath.startsWith("/app/sessions/") || appPath.startsWith("/app/feedback/");
  const isActiveHost = !isGuestAudience && auth ? canUseHostApp(auth) : false;
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
  const [guestVerification, setGuestVerification] = useState<{
    key: string | null;
    status: "not-applicable" | "pending" | "available" | "unavailable";
  }>({ key: null, status: "not-applicable" });
  const latestGuestContinuationKey = useRef<string | null>(null);
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

  const sessionExpiry =
    !isGuestAudience && state.status === "session_expired" && state.cause
      ? state
      : null;
  const guestReadableExpiry = Boolean(
    sessionExpiry?.cause === "read"
      && clubSlug
      && guestNavigationCapability(pathname) === "OPEN",
  );
  const guestContinuationKey =
    guestReadableExpiry && clubSlug && sessionExpiry?.episode
      ? JSON.stringify({
          episode: sessionExpiry.episode,
          clubSlug,
          target: guestTarget.href,
          resource: appPath,
        })
      : null;
  const guestContinuationStatus = !guestContinuationKey
    ? "not-applicable"
    : guestVerification.key === guestContinuationKey
      ? guestVerification.status
      : "pending";
  const guestContinuationAvailable = guestContinuationStatus === "available";

  useEffect(() => {
    latestGuestContinuationKey.current = guestContinuationKey;
  }, [guestContinuationKey]);

  useEffect(() => {
    let cancelled = false;

    if (!guestContinuationKey || !clubSlug) {
      return () => {
        cancelled = true;
      };
    }

    void verifyGuestReadableRoute(clubSlug, guestTarget).then(
      () => {
        if (!cancelled && latestGuestContinuationKey.current === guestContinuationKey) {
          setGuestVerification({ key: guestContinuationKey, status: "available" });
        }
      },
      () => {
        if (!cancelled && latestGuestContinuationKey.current === guestContinuationKey) {
          setGuestVerification({ key: guestContinuationKey, status: "unavailable" });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [clubSlug, guestContinuationKey, guestTarget]);

  const continueAsGuest = async () => {
    const continuationKey = guestContinuationKey;
    if (!continuationKey || !clubSlug || guestContinuationStatus !== "available") {
      throw new Error("Guest continuation is no longer available.");
    }

    try {
      await verifyGuestReadableRoute(clubSlug, guestTarget);
    } catch (error) {
      if (latestGuestContinuationKey.current === continuationKey) {
        setGuestVerification({ key: continuationKey, status: "unavailable" });
      }
      throw error;
    }
    if (latestGuestContinuationKey.current !== continuationKey) {
      throw new Error("Guest continuation route changed during verification.");
    }

    const response = await logout();
    if (!response.ok && response.status !== 401) {
      throw new Error(`Guest continuation logout failed: ${response.status}`);
    }

    await queryClient.cancelQueries();
    queryClient.clear();
    markLoggedOut();
    await navigate(returnTo, { replace: true });
    navigate(0);
  };

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
          LinkComponent={AppLinkComponent}
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
          LinkComponent={AppLinkComponent}
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
        {sessionExpiry ? (
          <SessionExpiryRecovery
            cause={sessionExpiry.cause}
            loginHref={loginPathForReturnTo(returnTo)}
            guestContinuationStatus={guestContinuationStatus}
            canContinueAsGuest={guestContinuationAvailable}
            onContinueAsGuest={continueAsGuest}
          />
        ) : null}
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
        <PublicFooter
          publicBasePath={isGuestAudience && clubSlug ? `/clubs/${encodeURIComponent(clubSlug)}` : ""}
          showGuestMemberActions={false}
          LinkComponent={AppLinkComponent}
        />
      </div>
      <div className="mobile-only">
        <MobileTabBar
          variant={mobileVariant}
          currentSessionId={currentSessionId}
          currentSessionStatus={currentSessionStatus}
          onRetryCurrentSession={retryCurrentSession}
          appBasePath={basePath}
          appPath={appPath}
          LinkComponent={AppLinkComponent}
        />
      </div>
    </div>
  );
}
