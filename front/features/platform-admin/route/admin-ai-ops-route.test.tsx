import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import { platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminAiOpsRoute } from "./admin-ai-ops-route";

function renderRoute(initialEntry = "/admin/ai-ops") {
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
    failureCodes: [{ code: "PROVIDER_RATE_LIMITED", count: 2 }],
    providerCosts: [],
    staleCandidateCount: 0,
  });
  queryClient.setQueryData(platformAdminAiOpsJobsQuery().queryKey, { items: [] });
  queryClient.setQueryData(
    platformAdminAiOpsJobsQuery({ errorCode: "PROVIDER_RATE_LIMITED" }).queryKey,
    { items: [] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
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

  it("selecting a failure code pushes the errorCode filter to the URL", async () => {
    renderRoute();
    await userEvent.click(screen.getByRole("button", { name: /PROVIDER_RATE_LIMITED/ }));
    expect(await screen.findByRole("button", { name: "전체 보기" })).toBeInTheDocument();
  });

  it("renders the active filter banner when navigated with an errorCode", () => {
    renderRoute("/admin/ai-ops?errorCode=PROVIDER_RATE_LIMITED");
    const banner = screen.getByRole("status");
    expect(within(banner).getByText(/PROVIDER_RATE_LIMITED/)).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "전체 보기" })).toBeInTheDocument();
  });
});
