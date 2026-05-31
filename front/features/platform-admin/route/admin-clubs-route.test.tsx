import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminClubsRoute } from "./admin-clubs-route";

function renderRoute(items: Array<{
  clubId: string; slug: string; name: string;
  status: "ACTIVE" | "SETUP_REQUIRED" | "SUSPENDED" | "ARCHIVED";
  publicVisibility: "PRIVATE" | "PUBLIC";
  domainCount: number; domainActionRequiredCount: number;
  notificationFailureCount: number; aiFailureCount: number;
  firstHostOnboardingState: "MISSING" | "INVITED" | "ASSIGNED";
  tagline: string; about: string;
}>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, { items });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/clubs"]}>
        <Routes>
          <Route path="/admin/clubs" element={<AdminClubsRoute />} />
          <Route path="/admin/clubs/:clubId" element={<div>club detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminClubsRoute", () => {
  it("renders a row per club with key columns", () => {
    const { container } = renderRoute([
      {
        clubId: "c-1", slug: "alpha", name: "Alpha", status: "ACTIVE",
        publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 0,
        notificationFailureCount: 0, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("PRIVATE")).toBeInTheDocument();
  });

  it("navigates to club detail on row click", () => {
    renderRoute([
      {
        clubId: "c-1", slug: "alpha", name: "Alpha", status: "ACTIVE",
        publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 0,
        notificationFailureCount: 0, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    fireEvent.click(screen.getByRole("link", { name: /Alpha/ }));
    expect(screen.getByText("club detail")).toBeInTheDocument();
  });

  it("orders critical clubs before healthy clubs", () => {
    renderRoute([
      {
        clubId: "ok-1", slug: "healthy", name: "Healthy", status: "ACTIVE",
        publicVisibility: "PUBLIC", domainCount: 1, domainActionRequiredCount: 0,
        notificationFailureCount: 0, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
      {
        clubId: "crit-1", slug: "broken", name: "Broken", status: "ACTIVE",
        publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 2,
        notificationFailureCount: 0, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    const rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(within(rows[0]).getByText("Broken")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Healthy")).toBeInTheDocument();
  });

  it("shows a severity badge and reason for an at-risk club", () => {
    renderRoute([
      {
        clubId: "crit-1", slug: "broken", name: "Broken", status: "ACTIVE",
        publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 2,
        notificationFailureCount: 0, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    const rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(within(rows[0]).getByText("긴급")).toBeInTheDocument();
    expect(screen.getByText("도메인 조치 필요")).toBeInTheDocument();
  });

  it("filters the list to only critical clubs when the 긴급 filter is selected", () => {
    renderRoute([
      {
        clubId: "ok-1", slug: "healthy", name: "Healthy", status: "ACTIVE",
        publicVisibility: "PUBLIC", domainCount: 1, domainActionRequiredCount: 0,
        notificationFailureCount: 0, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
      {
        clubId: "crit-1", slug: "broken", name: "Broken", status: "SUSPENDED",
        publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 0,
        notificationFailureCount: 0, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "긴급" }));
    expect(screen.getByText("Broken")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
  });

  it("shows an empty hint when a filter matches no clubs", () => {
    renderRoute([
      {
        clubId: "ok-1", slug: "healthy", name: "Healthy", status: "ACTIVE",
        publicVisibility: "PUBLIC", domainCount: 1, domainActionRequiredCount: 0,
        notificationFailureCount: 0, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "긴급" }));
    expect(screen.getByText("선택한 필터에 해당하는 클럽이 없습니다.")).toBeInTheDocument();
  });

  it("shows a notification-failure reason and ranks the club critical", () => {
    renderRoute([
      {
        clubId: "ok-1", slug: "healthy", name: "Healthy", status: "ACTIVE",
        publicVisibility: "PUBLIC", domainCount: 1, domainActionRequiredCount: 0,
        notificationFailureCount: 0, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
      {
        clubId: "fail-1", slug: "failing", name: "Failing", status: "ACTIVE",
        publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 0,
        notificationFailureCount: 4, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Failing")).toBeInTheDocument();
    expect(screen.getByText("알림 실패 4건")).toBeInTheDocument();
  });
});
