import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminTodayRoute } from "./admin-today-route";

describe("AdminTodayRoute", () => {
  it("renders the priority queue heading and selected-item brief regions", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
      platformRole: "OWNER",
      activeClubCount: 0,
      domainActionRequiredCount: 0,
      domainsRequiringAction: [],
    });
    queryClient.setQueryData(platformAdminClubsQuery().queryKey, { items: [] });
    queryClient.setQueryData(platformAdminAiOpsSummaryQuery().queryKey, null);
    queryClient.setQueryData(platformAdminAiOpsJobsQuery().queryKey, { items: [] });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/today"]}>
          <AdminTodayRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: /오늘 할 일/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "작업 큐" })).toBeInTheDocument();
  });
});
