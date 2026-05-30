import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { platformAdminAnalyticsOverviewQuery } from "@/features/platform-admin/queries/platform-admin-analytics-queries";
import { AdminAnalyticsRoute } from "./admin-analytics-route";

function renderRoute(initialEntry = "/admin/analytics?window=7d") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(platformAdminAnalyticsOverviewQuery("7d").queryKey, {
    schema: "admin.analytics_overview.v1",
    generatedAt: "2026-05-30T00:00:00Z",
    window: "7d",
    kpis: [
      { key: "SESSION_COMPLETION", unit: "PERCENT", availability: "AVAILABLE", current: 75, prior: 60, deltaDirection: "UP" },
    ],
    clubBenchmark: { availability: "NOT_ENOUGH_DATA", rows: [] },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminAnalyticsRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminAnalyticsRoute", () => {
  it("renders the cached analytics overview from the URL window", () => {
    renderRoute();
    expect(screen.getByRole("heading", { name: "분석" })).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});
