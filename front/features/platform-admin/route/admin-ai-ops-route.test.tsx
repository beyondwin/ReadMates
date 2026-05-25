import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import { platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminAiOpsRoute } from "./admin-ai-ops-route";

function renderRoute() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
    platformRole: "OWNER",
    activeClubCount: 0,
    domainActionRequiredCount: 0,
    domainsRequiringAction: [],
  });
  queryClient.setQueryData(platformAdminAiOpsSummaryQuery().queryKey, {
    activeJobCount: 0,
    failedLast24h: 0,
    monthToDateCostEstimateUsd: "0",
    failureCodes: [],
    providerCosts: [],
    staleCandidateCount: 0,
  });
  queryClient.setQueryData(platformAdminAiOpsJobsQuery().queryKey, { items: [] });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/ai-ops"]}>
        <AdminAiOpsRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminAiOpsRoute", () => {
  it("renders the AI Ops heading and delegates to PlatformAdminAiOps", () => {
    renderRoute();
    expect(screen.getByRole("heading", { name: /AI Ops/, level: 1 })).toBeInTheDocument();
  });
});
