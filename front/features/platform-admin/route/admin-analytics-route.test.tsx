import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdminAnalyticsExport,
  fetchAdminAnalyticsOverview,
} from "@/features/platform-admin/api/platform-admin-analytics-api";
import type { PlatformAdminCapability } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { PlatformAdminRole } from "@/features/platform-admin/model/platform-admin-domain-types";
import { platformAdminAnalyticsOverviewQuery } from "@/features/platform-admin/queries/platform-admin-analytics-queries";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  platformAdminKeys,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { apiErrorFromResponse } from "@/shared/api/errors";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminAnalyticsRoute } from "./admin-analytics-route";

vi.mock("@/features/platform-admin/api/platform-admin-analytics-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-analytics-api")>();
  return {
    ...actual,
    fetchAdminAnalyticsExport: vi.fn(),
    fetchAdminAnalyticsOverview: vi.fn(),
  };
});

const OVERVIEW = {
  schema: "admin.analytics_overview.v2" as const,
  generatedAt: "2026-05-30T00:00:00Z",
  window: "7d" as const,
  kpis: [
    { key: "SESSION_COMPLETION" as const, label: "모임 완료율", definition: "완료된 모임 비율", unit: "PERCENT" as const, availability: "AVAILABLE" as const, current: 75, prior: 60, delta: 15, deltaDirection: "UP" as const },
  ],
  clubBenchmark: { availability: "NOT_ENOUGH_DATA" as const, rows: [] },
  series: [],
};

async function forbiddenError() {
  return apiErrorFromResponse(
    new Response(
      JSON.stringify({
        code: "PERMISSION_DENIED",
        message: "이 작업을 수행할 권한이 없습니다.",
        status: 403,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    ),
  );
}

function renderRoute(
  initialEntry = "/admin/analytics?window=7d",
  options: {
    role?: PlatformAdminRole;
    capabilities?: PlatformAdminCapability[];
    seedOverview?: boolean;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: 3 } },
  });
  installPlatformAdminAuthorityLossHandler(queryClient);
  queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
    schemaVersion: 1,
    role: options.role ?? "OWNER",
    status: "ACTIVE",
    capabilities: options.capabilities ?? ["VIEW_ANALYTICS", "EXPORT_ANALYTICS"],
    generatedAt: "2026-08-25T00:00:00Z",
  });
  if (options.seedOverview !== false) {
    queryClient.setQueryData(platformAdminAnalyticsOverviewQuery("7d").queryKey, OVERVIEW);
  }

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AdminAnalyticsRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("AdminAnalyticsRoute", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fetchAdminAnalyticsExport).mockReset();
    vi.mocked(fetchAdminAnalyticsOverview).mockReset();
  });

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

  it("does not request overview without VIEW_ANALYTICS", () => {
    renderRoute("/admin/analytics?window=7d", {
      role: "OWNER",
      capabilities: ["EXPORT_ANALYTICS"],
      seedOverview: false,
    });

    expect(fetchAdminAnalyticsOverview).not.toHaveBeenCalled();
    expect(screen.queryByText("75%")).not.toBeInTheDocument();
    expect(screen.getByText(/권한이 없습니다|분석 권한이 없습니다/)).toBeInTheDocument();
  });

  it("does not export for OWNER without EXPORT_ANALYTICS, including a direct handler click", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    renderRoute("/admin/analytics?window=7d", {
      role: "OWNER",
      capabilities: ["VIEW_ANALYTICS"],
    });

    expect(screen.getByText("75%")).toBeInTheDocument();
    const exportButton = screen.queryByRole("button", { name: "CSV 내려받기" });
    if (exportButton) {
      fireEvent.click(exportButton);
    }

    expect(fetchAdminAnalyticsExport).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("makes exactly one export request on 403, purges admin cache, and never downloads or retries", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    const blob = vi.spyOn(globalThis, "Blob");
    vi.mocked(fetchAdminAnalyticsExport).mockRejectedValue(await forbiddenError());
    const { queryClient } = renderRoute();

    fireEvent.click(screen.getByRole("button", { name: "CSV 내려받기" }));

    await waitFor(() => {
      expect(fetchAdminAnalyticsExport).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(platformAdminCapabilitiesQuery().queryKey)).toBeUndefined();
      expect(queryClient.getQueryData(platformAdminAnalyticsOverviewQuery("7d").queryKey)).toBeUndefined();
    });
    expect(queryClient.getQueriesData({ queryKey: platformAdminKeys.all })).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(blob).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(fetchAdminAnalyticsExport).toHaveBeenCalledTimes(1);

    act(() => {
      queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
        schemaVersion: 1,
        role: "OWNER",
        status: "ACTIVE",
        capabilities: ["VIEW_ANALYTICS", "EXPORT_ANALYTICS"],
        generatedAt: "2026-08-25T00:02:00Z",
      });
      queryClient.setQueryData(platformAdminAnalyticsOverviewQuery("7d").queryKey, OVERVIEW);
    });
    expect(await screen.findByRole("button", { name: "CSV 내려받기" })).toBeEnabled();
    expect(fetchAdminAnalyticsExport).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("CSV 파일을 내려받았습니다.")).not.toBeInTheDocument();
  });
});
