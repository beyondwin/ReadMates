import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
  platformAdminTodayClosingRisksQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { adminTodayLoaderFactory } from "./admin-today-data";

const api = vi.hoisted(() => ({
  fetchCapabilities: vi.fn(),
  fetchAiSummary: vi.fn(),
  fetchAiJobs: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-api")>()),
  fetchPlatformAdminAiGenerationCapabilities: api.fetchCapabilities,
  fetchPlatformAdminAiOpsSummary: api.fetchAiSummary,
  fetchPlatformAdminAiOpsJobs: api.fetchAiJobs,
}));

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  client.setQueryData(platformAdminSummaryQuery().queryKey, {
    platformRole: "OWNER",
    activeClubCount: 0,
    domainActionRequiredCount: 0,
    domains: [],
    domainsRequiringAction: [],
  });
  client.setQueryData(platformAdminClubsQuery().queryKey, { items: [] });
  client.setQueryData(platformAdminTodayClosingRisksQuery().queryKey, {
    schema: "admin.today_closing_risks.v1",
    generatedAt: "2026-08-01T00:00:00Z",
    items: [],
  });
  return client;
}

beforeEach(() => {
  api.fetchCapabilities.mockReset();
  api.fetchAiSummary.mockReset();
  api.fetchAiJobs.mockReset();
});

describe("adminTodayLoaderFactory", () => {
  it("does not request disabled AI Ops summary or jobs", async () => {
    api.fetchCapabilities.mockResolvedValue({ enabled: false });
    api.fetchAiSummary.mockResolvedValue({});
    api.fetchAiJobs.mockResolvedValue({ items: [], nextCursor: null });

    await adminTodayLoaderFactory(seededClient())();

    expect(api.fetchCapabilities).toHaveBeenCalledOnce();
    expect(api.fetchAiSummary).not.toHaveBeenCalled();
    expect(api.fetchAiJobs).not.toHaveBeenCalled();
  });
});
