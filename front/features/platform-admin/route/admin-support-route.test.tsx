import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { platformAdminClubsQuery, platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminSupportLedgerQuery } from "@/features/platform-admin/queries/platform-admin-support-queries";
import { AdminSupportRoute } from "./admin-support-route";

describe("AdminSupportRoute", () => {
  it("renders the support workbench shell", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(platformAdminSummaryQuery().queryKey, {
      platformRole: "OWNER",
      activeClubCount: 1,
      domainActionRequiredCount: 0,
      domains: [],
      domainsRequiringAction: [],
    });
    client.setQueryData(platformAdminClubsQuery().queryKey, { items: [] });
    client.setQueryData(platformAdminSupportLedgerQuery().queryKey, []);

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/admin/support"]}>
          <AdminSupportRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "지원", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지원 대상 검색" })).toBeInTheDocument();
  });
});
