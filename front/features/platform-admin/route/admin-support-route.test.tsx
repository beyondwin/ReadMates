import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { platformAdminClubsQuery, platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminSupportLedgerQuery } from "@/features/platform-admin/queries/platform-admin-support-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminSupportRoute } from "./admin-support-route";

function renderRoute() {
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

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/support"]}>
        <AdminSupportRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminSupportRoute", () => {
  it("renders the support workbench shell", () => {
    const { container } = renderRoute();
    expect(screen.getByRole("heading", { name: "지원", level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
    expect(screen.getByRole("heading", { name: "지원 대상 검색" })).toBeInTheDocument();
    expect(screen.getByText("이름 또는 이메일로 지원 대상을 검색하세요.")).toBeInTheDocument();
    expect(screen.queryByText("검색 결과가 없습니다.")).not.toBeInTheDocument();
  });
});
