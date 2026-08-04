import { type MouseEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router";
import {
  adminOtherAccountLoginPath,
  adminWorkspaceAccountLabel,
  deriveAdminWorkspaceDestinations,
} from "@/features/platform-admin/model/admin-workspace-switcher-model";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminOperationCasesQuery } from "@/features/platform-admin/queries/platform-admin-operations-queries";
import { canDo } from "@/features/platform-admin/model/platform-admin-permissions";
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
import {
  commitPlatformAdminOnboarding,
  previewPlatformAdminOnboarding,
} from "@/features/platform-admin/api/platform-admin-api";
import type { AdminOperationCasesResponse } from "@/features/platform-admin/api/platform-admin-operations-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { logoutCurrentSession } from "@/shared/auth/session-api";
import { AdminBreadcrumbProvider } from "./admin-breadcrumb-context";
import { useAdminBreadcrumbExtra } from "./admin-breadcrumb-hook";

export function AdminShellLayout({ auth = null }: { auth?: AuthMeResponse | null }) {
  return (
    <AdminBreadcrumbProvider>
      <AdminShellLayoutInner auth={auth} />
    </AdminBreadcrumbProvider>
  );
}

function AdminShellLayoutInner({ auth }: { auth: AuthMeResponse | null }) {
  const summaryQuery = useQuery(platformAdminSummaryQuery());
  useQuery(platformAdminClubsQuery());
  const operationsQuery = useQuery(platformAdminOperationCasesQuery({}, { active: true }));
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { extra } = useAdminBreadcrumbExtra();
  const [isWizardDirty, setIsWizardDirty] = useState(false);
  const workspaceDestinations = deriveAdminWorkspaceDestinations(auth);
  const workspaceAccountLabel = adminWorkspaceAccountLabel(auth);
  const otherAccountLoginPath = adminOtherAccountLoginPath(location.pathname, location.search, location.hash);

  const summary = summaryQuery.data;
  const role = summary?.platformRole ?? "SUPPORT";
  const commandStatus = deriveCommandStatus(
    operationsQuery.data,
    operationsQuery.isError,
  );

  const routePath = derivePathSegment(location.pathname);
  const onboardingOpen = searchParams.get("onboarding") === "1" && canDo(role, "create_club");

  function closeOnboarding() {
    const next = new URLSearchParams(searchParams);
    next.delete("onboarding");
    navigate(
      { pathname: location.pathname, search: next.toString() ? `?${next.toString()}` : "" },
      { replace: true },
    );
    setIsWizardDirty(false);
  }

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
      <a href="#admin-main" className="admin-shell__skip-link" onClick={focusAdminMain}>
        본문으로 건너뛰기
      </a>
      <header className="admin-shell__header">
        <span className="admin-shell__wordmark">ReadMates · 운영</span>
        <AdminBreadcrumb routePath={routePath} extra={extra} />
        <div className="admin-shell__header-actions">
          {canDo(role, "create_club") ? (
            <Link
              to={{
                pathname: location.pathname,
                search: appendOnboardingQuery(searchParams),
              }}
              className="btn btn-primary btn-sm"
            >
              새 클럽
            </Link>
          ) : null}
          <span className="admin-shell__role-badge">{role}</span>
          <AdminWorkspaceSwitcher
            accountLabel={workspaceAccountLabel}
            destinations={workspaceDestinations}
            onOtherAccountLogin={otherAccountLogin}
          />
        </div>
      </header>
      <AdminCommandStatus {...commandStatus} />
      <div className="admin-shell__body">
        <aside className="admin-shell__nav">
          <AdminLayoutNav role={role} ariaLabel="Admin 콘솔" />
        </aside>
        <main id="admin-main" className="admin-shell__main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      {onboardingOpen ? (
        <AdminOnboardingModal isDirty={isWizardDirty} onRequestClose={closeOnboarding}>
          <PlatformAdminOnboardingWizard
            onPreview={previewPlatformAdminOnboarding}
            onCommit={commitPlatformAdminOnboarding}
            onDirtyChange={setIsWizardDirty}
            onCreated={(result) => {
              setIsWizardDirty(false);
              navigate(`/admin/clubs/${result.club.clubId}`, { replace: true });
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
  if (stripped.startsWith("clubs/") && stripped !== "clubs") return "clubs/:clubId";
  return stripped;
}

function appendOnboardingQuery(current: URLSearchParams): string {
  const next = new URLSearchParams(current);
  next.set("onboarding", "1");
  return `?${next.toString()}`;
}
