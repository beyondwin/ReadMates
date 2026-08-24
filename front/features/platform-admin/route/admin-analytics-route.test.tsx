import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { fetchAdminAnalyticsExport } from "@/features/platform-admin/api/platform-admin-analytics-api";
import { platformAdminAnalyticsOverviewQuery } from "@/features/platform-admin/queries/platform-admin-analytics-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminAnalyticsRoute } from "./admin-analytics-route";

vi.mock("@/features/platform-admin/api/platform-admin-analytics-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-analytics-api")>();
  return { ...actual, fetchAdminAnalyticsExport: vi.fn() };
});

function renderRoute(initialEntry = "/admin/analytics?window=7d") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(platformAdminAnalyticsOverviewQuery("7d").queryKey, {
    schema: "admin.analytics_overview.v2",
    generatedAt: "2026-05-30T00:00:00Z",
    window: "7d",
    kpis: [
      { key: "SESSION_COMPLETION", label: "모임 완료율", definition: "완료된 모임 비율", unit: "PERCENT", availability: "AVAILABLE", current: 75, prior: 60, delta: 15, deltaDirection: "UP" },
    ],
    clubBenchmark: { availability: "NOT_ENOUGH_DATA", rows: [] },
    series: [],
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
    const { container } = renderRoute();
    expect(screen.getByRole("heading", { name: "분석" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("downloads the server CSV blob and revokes the temporary object URL", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:analytics-export");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.mocked(fetchAdminAnalyticsExport).mockResolvedValue({
      blob: new Blob(["csv"]),
      filename: "readmates-admin-analytics-7d-2026-05-30.csv",
    });
    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: "CSV 내려받기" }));

    await waitFor(() => expect(fetchAdminAnalyticsExport).toHaveBeenCalledWith("7d"));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:analytics-export");
  });
});
