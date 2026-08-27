import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  useBlocker,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import {
  adminOtherAccountLoginPath,
  adminWorkspaceAccountLabel,
  deriveAdminWorkspaceDestinations,
} from "@/features/platform-admin/model/admin-workspace-switcher-model";
import { buildAdminDetailHref } from "@/features/platform-admin/model/admin-route-state";
import { platformAdminClubListHref } from "@/features/platform-admin/model/platform-admin-club-list-filters";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  subscribePlatformAdminAuthorityLoss,
  useCommitPlatformAdminOnboardingMutation,
  usePreviewPlatformAdminOnboardingMutation,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { useAdminAlarmSummary } from "@/features/platform-admin/queries/admin-alarm-summary";
import { AdminAlarmBar } from "@/features/platform-admin/ui/admin-alarm-bar";
import { AdminBreadcrumb } from "@/features/platform-admin/ui/admin-breadcrumb";
import { AdminLayoutNav } from "@/features/platform-admin/ui/admin-layout-nav";
import { AdminOnboardingModal } from "@/features/platform-admin/ui/admin-onboarding-modal";
import { AdminWorkspaceSwitcher } from "@/features/platform-admin/ui/admin-workspace-switcher";
import { PlatformAdminOnboardingWizard } from "@/features/platform-admin/ui/platform-admin-onboarding-wizard";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { logoutCurrentSession } from "@/shared/auth/session-api";
import { AdminBreadcrumbProvider } from "./admin-breadcrumb-context";
import { useAdminBreadcrumbExtra } from "./admin-breadcrumb-hook";
import "@/features/platform-admin/ui/admin-editorial-ledger.css";

export function AdminShellLayout({
  auth = null,
}: {
  auth?: AuthMeResponse | null;
}) {
  return (
    <AdminBreadcrumbProvider>
      <AdminShellLayoutInner auth={auth} />
    </AdminBreadcrumbProvider>
  );
}

function AdminShellLayoutInner({ auth }: { auth: AuthMeResponse | null }) {
  const queryClient = useQueryClient();
  const [authorityLost, setAuthorityLost] = useState(false);
  const [workspaceMenuEpoch, setWorkspaceMenuEpoch] = useState(0);
  const capabilitiesQuery = useQuery({
    ...platformAdminCapabilitiesQuery(),
    enabled: !authorityLost,
  });
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { extra } = useAdminBreadcrumbExtra();
  const [isWizardDirty, setIsWizardDirty] = useState(false);
  const [onboardingEffectPending, setOnboardingEffectPending] = useState(false);
  const allowOnboardingNavigation = useRef(false);
  const previewOnboarding = usePreviewPlatformAdminOnboardingMutation();
  const commitOnboarding = useCommitPlatformAdminOnboardingMutation();
  const workspaceDestinations = deriveAdminWorkspaceDestinations(auth);
  const workspaceAccountLabel = adminWorkspaceAccountLabel(auth);
  const otherAccountLoginPath = adminOtherAccountLoginPath(
    location.pathname,
    location.search,
    location.hash,
  );

  const capabilities = capabilitiesQuery.data ?? null;
  const alarm = useAdminAlarmSummary();
  const canCreateClub =
    capabilities != null && canAdmin(capabilities, "CREATE_CLUB");

  const routePath = derivePathSegment(location.pathname);
  const onboardingRequested = searchParams.get("onboarding") === "1";
  const onboardingOpen = onboardingRequested && canCreateClub;
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) => {
        if (allowOnboardingNavigation.current) return false;
        if ((!isWizardDirty && !onboardingEffectPending) || !onboardingOpen)
          return false;
        const nextOnboarding =
          new URLSearchParams(nextLocation.search).get("onboarding") === "1";
        return (
          currentLocation.pathname !== nextLocation.pathname || !nextOnboarding
        );
      },
      [isWizardDirty, onboardingEffectPending, onboardingOpen],
    ),
  );

  useEffect(() => {
    allowOnboardingNavigation.current = false;
  }, [location.key]);

  if (!canCreateClub && (isWizardDirty || onboardingEffectPending)) {
    setIsWizardDirty(false);
    setOnboardingEffectPending(false);
  }

  useEffect(() => {
    if (capabilities == null || canCreateClub || !onboardingRequested) return;
    allowOnboardingNavigation.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("onboarding");
    navigate(
      {
        pathname: location.pathname,
        search: next.toString() ? `?${next.toString()}` : "",
      },
      { replace: true },
    );
  }, [
    canCreateClub,
    capabilities,
    location.pathname,
    navigate,
    onboardingRequested,
    searchParams,
  ]);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (onboardingEffectPending) {
      blocker.reset();
      return;
    }
    if (window.confirm("작성 중인 클럽 온보딩을 중단하고 이동할까요?")) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, onboardingEffectPending]);

  function closeOnboarding() {
    if (onboardingEffectPending) return;
    allowOnboardingNavigation.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("onboarding");
    navigate(
      {
        pathname: location.pathname,
        search: next.toString() ? `?${next.toString()}` : "",
      },
      { replace: true },
    );
    setIsWizardDirty(false);
  }

  useEffect(() => {
    installPlatformAdminAuthorityLossHandler(queryClient);
    return subscribePlatformAdminAuthorityLoss(() => {
      setAuthorityLost(true);
      setWorkspaceMenuEpoch((epoch) => epoch + 1);
      setIsWizardDirty(false);
      allowOnboardingNavigation.current = true;
      const next = new URLSearchParams(searchParams);
      if (!next.has("onboarding")) {
        return;
      }
      next.delete("onboarding");
      navigate(
        {
          pathname: location.pathname,
          search: next.toString() ? `?${next.toString()}` : "",
        },
        { replace: true },
      );
    });
  }, [location.pathname, navigate, queryClient, searchParams]);

  async function otherAccountLogin() {
    const response = await logoutCurrentSession();
    if (response.ok || response.status === 401) {
      window.location.assign(otherAccountLoginPath);
      return true;
    }
    return false;
  }

  return (
    <div className="admin-shell">
      <a
        href="#admin-main"
        className="admin-shell__skip-link"
        onClick={focusAdminMain}
      >
        본문으로 건너뛰기
      </a>
      <header className="admin-shell__header">
        <span className="admin-shell__wordmark">ReadMates · 운영</span>
        <AdminBreadcrumb routePath={routePath} extra={extra} />
        <div className="admin-shell__header-actions">
          {capabilities ? (
            <span className="admin-shell__role-badge">{capabilities.role}</span>
          ) : null}
          <AdminWorkspaceSwitcher
            key={workspaceMenuEpoch}
            accountLabel={workspaceAccountLabel}
            destinations={workspaceDestinations}
            onOtherAccountLogin={otherAccountLogin}
          />
        </div>
      </header>
      <div className="admin-shell__body">
        <aside className="admin-shell__nav">
          <AdminLayoutNav
            capabilities={capabilities}
            ariaLabel="Admin 콘솔"
            todayCount={alarm.summary?.attention.count ?? null}
          />
        </aside>
        <main id="admin-main" className="admin-shell__main" tabIndex={-1}>
          <AdminAlarmBar summary={alarm.summary} state={alarm.state} />
          <Outlet />
        </main>
      </div>
      {onboardingOpen ? (
        <AdminOnboardingModal
          isDirty={isWizardDirty}
          effectPending={onboardingEffectPending}
          onRequestClose={closeOnboarding}
        >
          <PlatformAdminOnboardingWizard
            enabled={canCreateClub}
            onPreview={previewOnboarding.mutateAsync}
            onCommit={commitOnboarding.mutateAsync}
            onDirtyChange={setIsWizardDirty}
            onEffectPendingChange={setOnboardingEffectPending}
            onViewClub={(clubId) => {
              allowOnboardingNavigation.current = true;
              navigate(
                buildAdminDetailHref(`/admin/clubs/${clubId}`, {
                  returnTo: platformAdminClubListHref(searchParams),
                  focusId: clubId,
                  scrollTop: 0,
                }),
                { replace: true },
              );
            }}
          />
        </AdminOnboardingModal>
      ) : null}
    </div>
  );
}

function focusAdminMain(event: MouseEvent<HTMLAnchorElement>) {
  const main = document.getElementById("admin-main");
  if (!main) return;
  event.preventDefault();
  main.focus();
}

function derivePathSegment(pathname: string): string {
  const stripped = pathname.replace(/^\/admin\/?/, "");
  if (!stripped) return "today";
  if (stripped.startsWith("clubs/") && stripped !== "clubs")
    return "clubs/:clubId";
  return stripped;
}
