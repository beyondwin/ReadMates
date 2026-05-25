import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type {
  PlatformAdminClubListResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/model/platform-admin-domain-types";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminShellLayout } from "./admin-shell-layout";

const summary: PlatformAdminSummaryResponse = {
  platformRole: "OWNER",
  activeClubCount: 1,
  domainActionRequiredCount: 0,
  domainsRequiringAction: [],
};

const clubs: PlatformAdminClubListResponse = { items: [] };

function renderShell(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, summary);
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, clubs);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/admin/*" element={<AdminShellLayout />}>
            <Route path="today" element={<div>today content</div>} />
            <Route path="clubs" element={<div>clubs content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminShellLayout", () => {
  it("renders status strip, leftnav, and breadcrumb", () => {
    renderShell("/admin/today");
    expect(screen.getAllByText("OWNER").length).toBeGreaterThan(0);
    expect(screen.getByText("오늘/헬스")).toBeInTheDocument();
    expect(screen.getByText("today content")).toBeInTheDocument();
  });

  it("renders the new-club button for OWNER role", () => {
    renderShell("/admin/today");
    expect(screen.getByRole("link", { name: /새 클럽/ })).toBeInTheDocument();
  });

  it("shows the onboarding modal when ?onboarding=1 is present", () => {
    renderShell("/admin/today?onboarding=1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not show the onboarding modal without the query param", () => {
    renderShell("/admin/today");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
