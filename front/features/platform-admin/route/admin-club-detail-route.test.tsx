import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  platformAdminClubsQuery,
  platformAdminSupportGrantsQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminClubOperationsQuery } from "@/features/platform-admin/queries/platform-admin-club-operations-queries";
import { AdminBreadcrumbProvider } from "./admin-breadcrumb-context";
import { AdminClubDetailRoute } from "./admin-club-detail-route";

function renderRoute(clubId: string, clubs: Array<{
  clubId: string; slug: string; name: string; tagline: string; about: string;
  status: "ACTIVE" | "SETUP_REQUIRED" | "SUSPENDED" | "ARCHIVED";
  publicVisibility: "PRIVATE" | "PUBLIC";
  domainCount: number; domainActionRequiredCount: number;
  notificationFailureCount: number; aiFailureCount: number;
  firstHostOnboardingState: "MISSING" | "INVITED" | "ASSIGNED";
}>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, { items: clubs });
  queryClient.setQueryData(platformAdminSupportGrantsQuery(clubId).queryKey, []);
  queryClient.setQueryData(platformAdminClubOperationsQuery(clubId).queryKey, {
    schema: "admin.club_operations_snapshot.v1",
    generatedAt: "2026-05-27T00:00:00Z",
    club: { clubId, slug: "alpha", name: "Alpha", status: "ACTIVE", publicVisibility: "PRIVATE" },
    readiness: { state: "READY", blockingReasons: [], nextAction: null },
    memberActivity: { activeCount: 1, dormantCount: 0, pendingViewerCount: 0, hostCount: 1 },
    sessionProgress: { upcomingCount: 0, currentOpenCount: 0, closedCount: 0, publishedRecordCount: 0, incompleteRecordCount: 0 },
    notificationHealth: { pending: 0, failed: 0, dead: 0, lastSuccessAt: null, failureClusters: [] },
    aiUsage: { activeJobs: 0, failedRecentJobs: 0, staleCandidates: 0, costEstimateUsd: "0.0000", state: "NO_RECENT_USAGE" },
    safeLinks: [],
  });
  // Bypass loader by injecting loader data via a wrapper route element
  function Wrapper() {
    return <AdminClubDetailRoute />;
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminBreadcrumbProvider>
        <MemoryRouter initialEntries={[`/admin/clubs/${clubId}`]}>
          <Routes>
            <Route
              path="/admin/clubs/:clubId"
              element={<Wrapper />}
              loader={() => ({ clubId })}
            />
          </Routes>
        </MemoryRouter>
      </AdminBreadcrumbProvider>
    </QueryClientProvider>,
  );
}

describe("AdminClubDetailRoute", () => {
  it("renders 'not found' card when clubId does not exist", () => {
    renderRoute("missing", []);
    expect(screen.getByText(/해당 클럽을 찾을 수 없습니다/)).toBeInTheDocument();
  });

  it("renders club summary for a known club", () => {
    renderRoute("c-1", [{
      clubId: "c-1", slug: "alpha", name: "Alpha", tagline: "", about: "",
      status: "ACTIVE", publicVisibility: "PRIVATE",
      domainCount: 0, domainActionRequiredCount: 0,
      notificationFailureCount: 0, aiFailureCount: 0,
      firstHostOnboardingState: "ASSIGNED",
    }]);
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alpha 운영 스냅샷" })).toBeInTheDocument();
    expect(screen.getByText(/alpha/)).toBeInTheDocument();
  });
});
