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
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  platformAdminSummaryQuery,
  subscribePlatformAdminAuthorityLoss,
  useCommitPlatformAdminOnboardingMutation,
  usePreviewPlatformAdminOnboardingMutation,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminOperationCasesQuery } from "@/features/platform-admin/queries/platform-admin-operations-queries";
import { buildAdminOperationsView } from "@/features/platform-admin/model/platform-admin-operations-model";
import { AdminBreadcrumb } from "@/features/platform-admin/ui/admin-breadcrumb";
import {
  AdminCommandStatus,
  type AdminCommandStatusProps,
} from "@/features/platform-admin/ui/admin-command-status";
import { AdminLayoutNav } from "@/features/platform-admin/ui/admin-layout-nav";
import { AdminOnboardingModal } from "@/features/platform-admin/ui/admin-onboarding-modal";
import { AdminWorkspaceSwitcher } from "@/features/platform-admin/ui/admin-workspace-switcher";
import { PlatformAdminOnboardingWizard } from "@/features/platform-admin/ui/platform-admin-onboarding-wizard";
import type { AdminOperationCasesResponse } from "@/features/platform-admin/api/platform-admin-operations-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { logoutCurrentSession } from "@/shared/auth/session-api";
import { AdminBreadcrumbProvider } from "./admin-breadcrumb-context";
import { useAdminBreadcrumbExtra } from "./admin-breadcrumb-hook";

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
  useQuery({ ...platformAdminSummaryQuery(), enabled: !authorityLost });
  const operationsQuery = useQuery({
    ...platformAdminOperationCasesQuery({}, { active: true }),
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
  const canCreateClub =
    capabilities != null && canAdmin(capabilities, "CREATE_CLUB");
  const commandStatus = deriveCommandStatus(
    operationsQuery.data,
    operationsQuery.isError,
  );

  const routePath = derivePathSegment(location.pathname);
  const onboardingOpen =
    searchParams.get("onboarding") === "1" && canCreateClub;
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
      <AdminCommandStatus {...commandStatus} />
      <div className="admin-shell__body">
        <aside className="admin-shell__nav">
          <AdminLayoutNav capabilities={capabilities} ariaLabel="Admin 콘솔" />
        </aside>
        <main id="admin-main" className="admin-shell__main" tabIndex={-1}>
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
            onPreview={previewOnboarding.mutateAsync}
            onCommit={commitOnboarding.mutateAsync}
            onDirtyChange={setIsWizardDirty}
            onEffectPendingChange={setOnboardingEffectPending}
            onViewClub={(clubId) => {
              allowOnboardingNavigation.current = true;
              navigate(`/admin/clubs/${clubId}`, { replace: true });
            }}
          />
        </AdminOnboardingModal>
      ) : null}
    </div>
  );
}

function deriveCommandStatus(
  operations: AdminOperationCasesResponse | undefined,
  isError: boolean,
): AdminCommandStatusProps {
  if (isError) return { state: "unavailable" };
  if (!operations) return { state: "loading" };
  const view = buildAdminOperationsView(operations, null);
  return {
    state: "ready",
    sourceStatusLabel: view.sourceStatusLabel,
    openCount: operations.counts.open,
    generatedAtLabel: view.generatedAtLabel,
  };
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
