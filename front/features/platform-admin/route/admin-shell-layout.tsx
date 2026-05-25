import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { canDo } from "@/features/platform-admin/model/platform-admin-permissions";
import { deriveStripMetrics } from "@/features/platform-admin/model/admin-status-strip-model";
import { AdminBreadcrumb } from "@/features/platform-admin/ui/admin-breadcrumb";
import { AdminLayoutNav } from "@/features/platform-admin/ui/admin-layout-nav";
import { AdminOnboardingModal } from "@/features/platform-admin/ui/admin-onboarding-modal";
import { AdminStatusStrip } from "@/features/platform-admin/ui/admin-status-strip";
import { PlatformAdminOnboardingWizard } from "@/features/platform-admin/ui/platform-admin-onboarding-wizard";
import {
  commitPlatformAdminOnboarding,
  previewPlatformAdminOnboarding,
} from "@/features/platform-admin/api/platform-admin-api";
import { AdminBreadcrumbProvider, useAdminBreadcrumbExtra } from "./admin-breadcrumb-context";

export function AdminShellLayout() {
  return (
    <AdminBreadcrumbProvider>
      <AdminShellLayoutInner />
    </AdminBreadcrumbProvider>
  );
}

function AdminShellLayoutInner() {
  const summaryQuery = useQuery(platformAdminSummaryQuery());
  const clubsQuery = useQuery(platformAdminClubsQuery());
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { extra } = useAdminBreadcrumbExtra();
  const [isWizardDirty, setIsWizardDirty] = useState(false);

  const summary = summaryQuery.data;
  const clubs = clubsQuery.data;
  const role = summary?.platformRole ?? "SUPPORT";
  const stripError = summaryQuery.isError || clubsQuery.isError;
  const stripMetrics =
    summary && clubs
      ? deriveStripMetrics(summary, clubs)
      : {
          platformRole: role,
          setupRequiredCount: 0,
          readyToPublishCount: 0,
          domainActionRequiredCount: 0,
        };

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

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <span className="admin-shell__wordmark">ReadMates Admin</span>
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
          <Link to="/app" className="btn btn-ghost btn-sm">
            → 멤버 공간
          </Link>
        </div>
      </header>
      <AdminStatusStrip metrics={stripMetrics} error={stripError} />
      <div className="admin-shell__body">
        <aside className="admin-shell__nav">
          <AdminLayoutNav role={role} />
        </aside>
        <main className="admin-shell__main">
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
