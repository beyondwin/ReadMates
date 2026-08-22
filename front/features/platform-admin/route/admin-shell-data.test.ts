import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  platformAdminCapabilitiesQuery,
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { fetchAdminOperationCases } from "@/features/platform-admin/api/platform-admin-operations-api";
import { fetchPlatformAdminCapabilities } from "@/features/platform-admin/api/platform-admin-capabilities-api";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";

vi.mock("@/shared/auth/platform-admin-loader", () => ({
  requirePlatformAdminLoaderAuth: vi.fn(async () => ({
    authenticated: true,
    platformAdmin: { role: "OWNER" },
  })),
}));

vi.mock("@/features/platform-admin/api/platform-admin-operations-api", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/platform-admin/api/platform-admin-operations-api")
  >()),
  fetchAdminOperationCases: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-capabilities-api", () => ({
  fetchPlatformAdminCapabilities: vi.fn(),
}));

import { adminShellLoaderFactory } from "./admin-shell-data";

const capabilities: PlatformAdminCapabilities = {
  schemaVersion: 1,
  role: "OWNER",
  status: "ACTIVE",
  capabilities: ["VIEW_TODAY", "VIEW_CLUBS", "CREATE_CLUB"],
  generatedAt: "2026-08-22T00:00:00Z",
};

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  client.setQueryData(platformAdminSummaryQuery().queryKey, {
    platformRole: "OWNER",
    activeClubCount: 0,
    domainActionRequiredCount: 0,
    domainsRequiringAction: [],
  });
  client.setQueryData(platformAdminClubsQuery().queryKey, { items: [] });
  return client;
}

describe("adminShellLoaderFactory", () => {
  beforeEach(() => {
    vi.mocked(fetchAdminOperationCases).mockReset();
    vi.mocked(fetchPlatformAdminCapabilities).mockReset();
    vi.mocked(fetchPlatformAdminCapabilities).mockResolvedValue(capabilities);
  });

  it("fetches capabilities as an authoritative required query", async () => {
    const client = seededClient();
    vi.mocked(fetchAdminOperationCases).mockResolvedValue({
      schema: "admin.operation_cases.v1",
      generatedAt: "2026-08-04T10:00:00Z",
      counts: { open: 0, critical: 0, assignedToMe: 0, snoozed: 0 },
      sources: [],
      items: [],
      nextCursor: null,
    });

    await expect(adminShellLoaderFactory(client)()).resolves.toMatchObject({
      authenticated: true,
    });

    expect(fetchPlatformAdminCapabilities).toHaveBeenCalledOnce();
    expect(client.getQueryData(platformAdminCapabilitiesQuery().queryKey)).toEqual(capabilities);
  });

  it("fails the route when the capabilities projection cannot be loaded", async () => {
    vi.mocked(fetchPlatformAdminCapabilities).mockRejectedValue(new Error("projection unavailable"));

    await expect(adminShellLoaderFactory(seededClient())()).rejects.toThrow("projection unavailable");
  });

  it("prefetches the optional operations summary without making its failure route-fatal", async () => {
    vi.mocked(fetchAdminOperationCases).mockRejectedValue(new Error("operations unavailable"));

    await expect(adminShellLoaderFactory(seededClient())()).resolves.toMatchObject({
      authenticated: true,
    });
    expect(fetchAdminOperationCases).toHaveBeenCalledOnce();
    expect(fetchPlatformAdminCapabilities).toHaveBeenCalledOnce();
  });

  it("does not prefetch the platform club list for the shell", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    client.setQueryData(platformAdminSummaryQuery().queryKey, {
      platformRole: "OWNER",
      activeClubCount: 0,
      domainActionRequiredCount: 0,
      domainsRequiringAction: [],
    });
    vi.mocked(fetchAdminOperationCases).mockResolvedValue({
      schema: "admin.operation_cases.v1",
      generatedAt: "2026-08-04T10:00:00Z",
      counts: { open: 0, critical: 0, assignedToMe: 0, snoozed: 0 },
      sources: [],
      items: [],
      nextCursor: null,
    });

    await expect(adminShellLoaderFactory(client)()).resolves.toMatchObject({
      authenticated: true,
    });
    expect(client.getQueryData(platformAdminClubsQuery().queryKey)).toBeUndefined();
  });
});
