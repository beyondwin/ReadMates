import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  platformAdminClubsQuery,
  platformAdminSupportGrantsQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminBreadcrumbProvider } from "./admin-breadcrumb-context";
import { AdminClubDetailRoute } from "./admin-club-detail-route";

function renderRoute(clubId: string, clubs: Array<{
  clubId: string; slug: string; name: string; tagline: string; about: string;
  status: "ACTIVE" | "SETUP_REQUIRED" | "SUSPENDED" | "ARCHIVED";
  publicVisibility: "PRIVATE" | "PUBLIC";
  domainCount: number; domainActionRequiredCount: number;
  firstHostOnboardingState: "MISSING" | "INVITED" | "ASSIGNED";
}>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, { items: clubs });
  queryClient.setQueryData(platformAdminSupportGrantsQuery(clubId).queryKey, []);
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
      domainCount: 0, domainActionRequiredCount: 0, firstHostOnboardingState: "ASSIGNED",
    }]);
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByText(/alpha/)).toBeInTheDocument();
  });
});
