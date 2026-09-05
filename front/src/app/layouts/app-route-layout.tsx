import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "react-router";
import { logout } from "@/features/auth/api/auth-api";
import { SessionExpiryRecovery } from "@/features/auth/ui/session-expiry-recovery";
import { AccountMenuController } from "@/features/auth/route/account-menu-controller";
import {
  HostPrimaryNavigation,
  type HostPrimaryDestination,
} from "@/features/host/ui/shell/host-primary-navigation";
import { HostUtilityActions, type HostUtilityActionsProps } from "@/features/host/ui/shell/host-utility-actions";
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
import { anonymousAuth, useAuth, useAuthActions } from "@/src/app/auth-state";
import { useAuthenticatedLogoutPublications } from "@/src/app/use-authenticated-logout-publications";
import { AppRouteSecurityController } from "@/src/app/app-route-security-controller";
import {
  GlobalSpaceTransitionController,
  globalSpaceTransitionEpochKey,
} from "@/src/app/global-space-transition-controller";
import { AppGlobalSpaceSwitcherBridge } from "@/src/app/global-space-switcher-bridge";
import {
  archiveReportReturnTarget,
  archiveSessionsReturnTarget,
  publicRecordsReturnTarget,
  readPublicReadmatesReturnTarget,
  readReadmatesReturnTarget,
  readmatesReturnState,
  resetReadmatesNavigationScroll,
} from "@/src/app/route-continuity";
import {
  candidateRoleSwitchTarget,
  resolveAuthorizedRoleSwitchTarget,
  workspaceFromCanonicalPath,
  type ClubWorkspace,
} from "@/src/app/workspace-route-model";
import {
  readLastSafeWorkspaceTarget,
  rememberLastSafeWorkspaceTarget,
} from "@/src/app/workspace-route-continuity";
import { Link } from "@/src/app/router-link";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { touchClubAccessOnce } from "@/shared/auth/club-access-query";
import { canUseHostApp, canUseMemberApp } from "@/shared/auth/member-app-access";
import { loginPathForReturnTo } from "@/shared/auth/login-return";
import type {
  ClubShellBackTarget,
  ClubWorkspace as ShellClubWorkspace,
  PrimaryNavigationItem,
} from "@/shared/model/app-club-shell";
import {
  hasHostRecordsReturnState,
  readAppReturnTarget,
  readHostRecordsReturnTarget,
} from "@/shared/routing/readmates-route-state";
import { HOST_ROUTE_HREFS } from "@/shared/routing/host-route-destinations";
import { AppClubShell } from "@/shared/ui/app-club-shell";
import { MobileHeader } from "@/shared/ui/mobile-header";
import { MobileTabBar } from "@/shared/ui/mobile-tab-bar";
import { PublicFooter } from "@/shared/ui/public-footer";
import {
  publishTransitionAction,
  TransitionOwnerObsoleteError,
  useTransitionSafetyOwner,
} from "@/shared/ui/use-transition-safety-owner";
import { READMATES_MOBILE_TAB_LABELS, READMATES_NAV_LABELS, READMATES_PRIMARY_NAV_LABELS } from "@/shared/ui/readmates-copy";
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
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
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
      fetchGuestNoteFeed(clubSlug, { ...page, sessionId }),
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

function scopedAppPath(basePath: string, path: string) {
  return basePath ? `${basePath}${path === "/app" ? "" : path.replace(/^\/app/, "")}` : path;
}

function scopeAppTarget(href: string, basePath: string) {
  return href.startsWith("/app") ? scopedAppPath(basePath, href) : href;
}

function hostRecordOwnedRoute(appPath: string, state: unknown, pathname: string) {
  return /^\/app\/host\/sessions\/[^/]+\/(?:closing|feedback-document)$/.test(appPath)
    || (/^\/app\/host\/sessions\/[^/]+(?:\/edit)?$/.test(appPath)
      && hasHostRecordsReturnState(state, pathname));
}

function hostPrimaryDestinations({
  appPath,
  pathname,
  state,
  basePath,
}: {
  appPath: string;
  pathname: string;
  state: unknown;
  basePath: string;
}): HostPrimaryDestination[] {
  const recordOwned = hostRecordOwnedRoute(appPath, state, pathname);

  return [
    {
      id: "operating-room",
      href: scopedAppPath(basePath, HOST_ROUTE_HREFS.operatingRoom),
      current: appPath === HOST_ROUTE_HREFS.operatingRoom || appPath === HOST_ROUTE_HREFS.operations,
    },
    {
      id: "meetings",
      href: scopedAppPath(basePath, HOST_ROUTE_HREFS.meetings),
      current: !recordOwned && (
        appPath === HOST_ROUTE_HREFS.meetings
        || appPath === HOST_ROUTE_HREFS.newSession
        || /^\/app\/host\/sessions\/[^/]+(?:\/edit)?$/.test(appPath)
      ),
    },
    {
      id: "people",
      href: scopedAppPath(basePath, HOST_ROUTE_HREFS.people),
      current: appPath === HOST_ROUTE_HREFS.people
        || appPath.startsWith(`${HOST_ROUTE_HREFS.people}/`)
        || appPath === HOST_ROUTE_HREFS.members,
    },
    {
      id: "records",
      href: scopedAppPath(basePath, HOST_ROUTE_HREFS.records),
      current: appPath === HOST_ROUTE_HREFS.records || recordOwned,
    },
  ];
}

function primaryNavigationItems({
  workspace,
  appPath,
  pathname,
  state,
  basePath,
}: {
  workspace: ShellClubWorkspace;
  appPath: string;
  pathname: string;
  state: unknown;
  basePath: string;
}): PrimaryNavigationItem[] {
  const navigationPath = appPath;

  if (workspace === "member") {
    return [
      {
        id: "member-today",
        label: READMATES_PRIMARY_NAV_LABELS.member.today,
        href: scopedAppPath(basePath, "/app"),
        icon: "home",
        current: navigationPath === "/app" || navigationPath === "/app/session" || navigationPath.startsWith("/app/session/"),
      },
      {
        id: "member-notes",
        label: READMATES_PRIMARY_NAV_LABELS.member.notes,
        href: scopedAppPath(basePath, "/app/notes"),
        icon: "notes",
        current: navigationPath === "/app/notes",
      },
      {
        id: "member-records",
        label: READMATES_PRIMARY_NAV_LABELS.member.records,
        href: scopedAppPath(basePath, "/app/archive"),
        icon: "archive",
        current: navigationPath.startsWith("/app/archive")
          || navigationPath.startsWith("/app/sessions/")
          || navigationPath.startsWith("/app/feedback/"),
      },
      {
        id: "member-my-space",
        label: READMATES_PRIMARY_NAV_LABELS.member.mySpace,
        href: scopedAppPath(basePath, "/app/me"),
        icon: "me",
        current: navigationPath.startsWith("/app/me") || navigationPath.startsWith("/app/notifications"),
      },
    ];
  }

  const icons = {
    "operating-room": "host",
    meetings: "session",
    people: "approve",
    records: "archive",
  } as const;
  const desktopLabels = {
    "operating-room": READMATES_PRIMARY_NAV_LABELS.host.operatingRoom,
    meetings: READMATES_PRIMARY_NAV_LABELS.host.meetings,
    people: READMATES_PRIMARY_NAV_LABELS.host.people,
    records: READMATES_PRIMARY_NAV_LABELS.host.records,
  } as const;
  const mobileLabels = {
    "operating-room": READMATES_MOBILE_TAB_LABELS.hostOperatingRoom,
    meetings: READMATES_MOBILE_TAB_LABELS.hostMeetings,
    people: READMATES_MOBILE_TAB_LABELS.hostPeople,
    records: READMATES_MOBILE_TAB_LABELS.hostRecords,
  } as const;

  return hostPrimaryDestinations({ appPath, pathname, state, basePath }).map((destination) => ({
    ...destination,
    id: `host-${destination.id}`,
    label: desktopLabels[destination.id],
    mobileLabel: mobileLabels[destination.id],
    icon: icons[destination.id],
  }));
}

function HostMobileBell(props: HostUtilityActionsProps) {
  return <HostUtilityActions {...props} compact />;
}

function appMobileTitle(workspace: ShellClubWorkspace, appPath: string, recordOwned: boolean) {
  if (workspace === "host" && (recordOwned || appPath === HOST_ROUTE_HREFS.records)) return "기록";
  if (workspace === "host" && appPath.startsWith(`${HOST_ROUTE_HREFS.people}/`)) return "사람";
  if (workspace === "host" && (appPath === HOST_ROUTE_HREFS.people || appPath === HOST_ROUTE_HREFS.members)) return "사람";
  if (workspace === "host" && (appPath === HOST_ROUTE_HREFS.settings || appPath === HOST_ROUTE_HREFS.invitations)) {
    return "초대와 설정";
  }
  if (workspace === "host" && appPath === HOST_ROUTE_HREFS.meetings) return "모임";
  if (appPath.startsWith("/app/feedback/")) return "피드백 문서";
  if (appPath.startsWith("/app/host/sessions/")) return "모임";
  if (workspace === "host" && appPath === "/app/host/notifications") return READMATES_MOBILE_TAB_LABELS.hostNotifications;
  if (appPath.startsWith("/app/host")) return workspace === "host" ? "운영실" : "오늘";
  if (appPath.startsWith("/app/sessions/")) return "지난 모임";
  if (appPath === "/app/session" || appPath.startsWith("/app/session/")) return READMATES_NAV_LABELS.member.currentSession;
  if (appPath === "/app/notes") return READMATES_NAV_LABELS.member.clubNotes;
  if (appPath.startsWith("/app/archive")) return READMATES_NAV_LABELS.member.archive;
  if (appPath.startsWith("/app/notifications") || appPath.startsWith("/app/me")) return READMATES_NAV_LABELS.member.mySpace;
  return workspace === "host" ? "운영실" : "읽는사이";
}

function appMobileBackTarget({
  workspace,
  appPath,
  pathname,
  state,
  basePath,
  recordOwned,
}: {
  workspace: ShellClubWorkspace;
  appPath: string;
  pathname: string;
  state: unknown;
  basePath: string;
  recordOwned: boolean;
}): ClubShellBackTarget | null {
  if (appPath === "/app/session" || appPath.startsWith("/app/session/") || appPath === "/app/notes") {
    return { href: scopedAppPath(basePath, "/app"), label: "홈", icon: "brand" };
  }
  if (appPath === "/app/host/sessions" || appPath === "/app/host/records") return null;
  if (workspace === "host" && recordOwned) {
    const target = readHostRecordsReturnTarget(state, pathname) ?? {
      href: scopedAppPath(basePath, HOST_ROUTE_HREFS.records),
      label: "기록으로",
    };
    return { href: scopeAppTarget(target.href, basePath), state: target.state, label: "뒤로", icon: "brand" };
  }
  if (appPath.startsWith("/app/host/sessions/")) {
    return { href: scopedAppPath(basePath, "/app/host/sessions"), label: "모임", icon: "brand" };
  }
  if (appPath.startsWith("/app/feedback/") && appPath.endsWith("/print")) {
    const sourceTarget = readAppReturnTarget(
      state,
      pathname,
      {
        ...readmatesNavigationContinuity.archiveReportReturnTarget,
        href: scopeAppTarget(readmatesNavigationContinuity.archiveReportReturnTarget.href, basePath),
      },
    );
    return {
      href: scopeAppTarget(appPath.replace(/\/print$/, ""), basePath),
      state: readmatesNavigationContinuity.readmatesReturnState(sourceTarget),
      label: "문서",
    };
  }
  if (appPath.startsWith("/app/feedback/")) {
    const target = readAppReturnTarget(
      state,
      pathname,
      {
        ...readmatesNavigationContinuity.archiveReportReturnTarget,
        href: scopeAppTarget(readmatesNavigationContinuity.archiveReportReturnTarget.href, basePath),
      },
    );
    return { href: scopeAppTarget(target.href, basePath), state: target.state, label: "뒤로" };
  }
  if (appPath.startsWith("/app/sessions/")) {
    const target = readAppReturnTarget(
      state,
      pathname,
      {
        ...readmatesNavigationContinuity.archiveSessionsReturnTarget,
        href: scopeAppTarget(readmatesNavigationContinuity.archiveSessionsReturnTarget.href, basePath),
      },
    );
    return { href: scopeAppTarget(target.href, basePath), state: target.state, label: "뒤로" };
  }
  if (
    appPath === "/app/me/records"
    || appPath === "/app/me/settings"
    || appPath === "/app/notifications"
    || appPath === "/app/notifications/settings"
  ) {
    return { href: scopedAppPath(basePath, "/app/me"), label: "뒤로" };
  }
  return null;
}

function useAppSpaceComposition({
  auth,
  isGuestAudience,
  pathname,
}: {
  auth: AuthMeResponse | null;
  isGuestAudience: boolean;
  pathname: string;
}) {
  const isHostWorkspace = workspaceFromCanonicalPath(pathname) === "host";
  const isActiveHost = !isGuestAudience && auth ? canUseHostApp(auth) : false;
  const authorizedWorkspaces = useMemo<ClubWorkspace[]>(() => {
    if (isGuestAudience || !auth) return [];
    return [
      ...(canUseMemberApp(auth) ? ["member" as const] : []),
      ...(canUseHostApp(auth) ? ["host" as const] : []),
    ];
  }, [auth, isGuestAudience]);
  const roleSwitchAction = useMemo(() => {
    const targetWorkspace: ClubWorkspace = isHostWorkspace ? "member" : "host";
    if (!authorizedWorkspaces.includes(targetWorkspace)) return null;
    const candidate = candidateRoleSwitchTarget({ pathname, targetWorkspace });
    const target = resolveAuthorizedRoleSwitchTarget({
      candidate,
      authorizedWorkspaces,
      correspondence: "unknown",
      lastSafeTarget: readLastSafeWorkspaceTarget(targetWorkspace),
    });
    return {
      href: target,
      label: targetWorkspace === "host" ? "호스트 공간" : "멤버 공간",
      navigation: candidate.navigation,
    };
  }, [authorizedWorkspaces, isHostWorkspace, pathname]);
  const desktopVariant: ShellClubWorkspace = isHostWorkspace ? "host" : "member";
  return {
    isHostWorkspace,
    isActiveHost,
    authorizedWorkspaces,
    roleSwitchAction,
    desktopVariant,
  };
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
  const onLogoutAccepted = useAuthenticatedLogoutPublications();
  const guestLogoutOwner = useTransitionSafetyOwner("guest-continuation-logout");
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
  const {
    isHostWorkspace,
    isActiveHost,
    authorizedWorkspaces,
    roleSwitchAction,
    desktopVariant,
  } = useAppSpaceComposition({
    auth,
    isGuestAudience,
    pathname,
  });
  const [guestVerification, setGuestVerification] = useState<{
    key: string | null;
    status: "not-applicable" | "pending" | "available" | "unavailable";
  }>({ key: null, status: "not-applicable" });
  const latestGuestContinuationKey = useRef<string | null>(null);
  const touchedClubSlugs = useRef(new Set<string>());

  useEffect(() => {
    if (isGuestAudience || !auth || !clubSlug || !canUseMemberApp(auth)) {
      return;
    }

    touchClubAccessOnce(touchedClubSlugs.current, clubSlug);
  }, [auth, clubSlug, isGuestAudience]);

  useEffect(() => {
    const workspace = workspaceFromCanonicalPath(pathname);
    if (authorizedWorkspaces.includes(workspace)) {
      rememberLastSafeWorkspaceTarget(workspace, pathname);
    }
  }, [authorizedWorkspaces, pathname]);

  useEffect(() => {
    if (
      !isHostWorkspace ||
      isActiveHost ||
      !authorizedWorkspaces.includes("member") ||
      (clubSlug !== null && auth?.currentMembership?.clubSlug !== undefined && auth.currentMembership?.clubSlug !== clubSlug)
    ) {
      return;
    }

    const candidate = candidateRoleSwitchTarget({
      pathname,
      targetWorkspace: "member",
      transition: "authority-loss",
    });
    const target = resolveAuthorizedRoleSwitchTarget({
      candidate,
      authorizedWorkspaces,
      correspondence: "unavailable",
      lastSafeTarget: readLastSafeWorkspaceTarget("member"),
    });
    navigate(target, { replace: candidate.navigation === "replace" });
  }, [auth?.currentMembership?.clubSlug, authorizedWorkspaces, clubSlug, isActiveHost, isHostWorkspace, navigate, pathname]);

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

    const operationId = `guest-continuation-logout-${globalThis.crypto.randomUUID()}`;
    const handle = guestLogoutOwner.begin(operationId, "L1", async () => ({ operationId, outcome: "still-unknown" }));
    let settled = false;
    try {
      const response = await logout();
      const succeeded = response.ok || response.status === 401;
      if (await handle.settle(succeeded ? "succeeded" : "failed") !== "accepted") {
        throw new TransitionOwnerObsoleteError();
      }
      settled = true;
      if (!succeeded) {
        return await publishTransitionAction(handle, "errorCopy", () => {
          throw new Error(`Guest continuation logout failed: ${response.status}`);
        });
      }
      await publishTransitionAction(handle, "cache", () => queryClient.clear());
      await publishTransitionAction(handle, "navigation", () => {
        markLoggedOut();
        void navigate(returnTo, { replace: true });
        navigate(0);
      });
      return "completed" as const;
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError || settled) throw error;
      return "unknown" as const;
    } finally {
      if (settled) handle.completePublication();
    }
  };

  const accountControl = auth?.authenticated ? (
    <AccountMenuController
      auth={auth}
      appBasePath={basePath}
      LinkComponent={Link}
      onLogoutAccepted={onLogoutAccepted}
    />
  ) : null;
  const expiryRecovery = sessionExpiry ? (
    <SessionExpiryRecovery
      cause={sessionExpiry.cause}
      loginHref={loginPathForReturnTo(returnTo)}
      guestContinuationStatus={guestContinuationStatus}
      canContinueAsGuest={guestContinuationAvailable}
      onContinueAsGuest={continueAsGuest}
    />
  ) : null;

  if (isGuestAudience) {
    return (
      <div className="app-shell">
        <div className="desktop-only">
          <TopNav variant="member" LinkComponent={AppLinkComponent} />
        </div>
        <div className="mobile-only">
          <MobileHeader
            variant="member"
            appBasePath={basePath}
            LinkComponent={AppLinkComponent}
            navigationContinuity={readmatesNavigationContinuity}
          />
        </div>
        <div className="app-content">
          {expiryRecovery}
          <RouteOutlet />
        </div>
        <div className="desktop-only">
          <PublicFooter
            publicBasePath={clubSlug ? `/clubs/${encodeURIComponent(clubSlug)}` : ""}
            showGuestMemberActions={false}
            LinkComponent={AppLinkComponent}
          />
        </div>
        <div className="mobile-only">
          <MobileTabBar variant="member" appBasePath={basePath} LinkComponent={AppLinkComponent} />
        </div>
      </div>
    );
  }

  const recordOwned = desktopVariant === "host" && hostRecordOwnedRoute(appPath, location.state, pathname);
  const primaryItems = primaryNavigationItems({
    workspace: desktopVariant,
    appPath,
    pathname,
    state: location.state,
    basePath,
  });
  const hostDestinations = desktopVariant === "host"
    ? hostPrimaryDestinations({ appPath, pathname, state: location.state, basePath })
    : null;
  const mobileBackTarget = appMobileBackTarget({
    workspace: desktopVariant,
    appPath,
    pathname,
    state: location.state,
    basePath,
    recordOwned,
  });
  const brandHref = scopedAppPath(basePath, desktopVariant === "host" ? "/app/host" : "/app");
  const hostUtilityProps: HostUtilityActionsProps | null = desktopVariant === "host" ? {
    settingsHref: scopedAppPath(basePath, HOST_ROUTE_HREFS.settings),
    memberViewHref: roleSwitchAction?.href ?? scopedAppPath(basePath, "/app"),
    notificationsHref: scopedAppPath(basePath, HOST_ROUTE_HREFS.notifications),
    newMeetingHref: scopedAppPath(basePath, HOST_ROUTE_HREFS.newSession),
    unreadNotifications: 0,
    permissionLimits: [],
    LinkComponent: AppLinkComponent,
  } : null;
  const hostUtilityActions = hostUtilityProps ? <HostUtilityActions {...hostUtilityProps} /> : null;

  return (
    <GlobalSpaceTransitionController
      key={globalSpaceTransitionEpochKey(pathname, auth ?? anonymousAuth)}
      auth={auth ?? anonymousAuth}
    >
      <AppClubShell
        workspace={desktopVariant}
        primaryItems={primaryItems}
        account={{ control: accountControl }}
        brandHref={brandHref}
        mobileTitle={appMobileTitle(desktopVariant, appPath, recordOwned)}
        mobileKicker={desktopVariant === "host" ? "호스트" : null}
        mobileBackTarget={mobileBackTarget}
        LinkComponent={AppLinkComponent}
        spaceSwitcher={{
          desktop: <AppGlobalSpaceSwitcherBridge auth={auth ?? anonymousAuth} />,
          mobile: <AppGlobalSpaceSwitcherBridge auth={auth ?? anonymousAuth} />,
        }}
        primarySlot={hostDestinations ? {
          desktop: (
            <HostPrimaryNavigation
              destinations={hostDestinations}
              mode="desktop"
              LinkComponent={AppLinkComponent}
            />
          ),
        } : undefined}
        mobileHeaderUtility={hostUtilityProps ? <HostMobileBell {...hostUtilityProps} /> : undefined}
        utilitySlot={hostUtilityActions ? {
          desktop: hostUtilityActions,
        } : undefined}
        beforeContent={expiryRecovery}
        securityController={<AppRouteSecurityController workspace={desktopVariant} />}
        desktopFooter={(
          <PublicFooter
            publicBasePath=""
            showGuestMemberActions={false}
            LinkComponent={AppLinkComponent}
          />
        )}
      >
        <RouteOutlet />
      </AppClubShell>
    </GlobalSpaceTransitionController>
  );
}
