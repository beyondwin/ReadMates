import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  platformAdminCapabilitiesQuery,
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { fetchAdminOperationCases } from "@/features/platform-admin/api/platform-admin-operations-api";
import { fetchPlatformAdminCapabilities } from "@/features/platform-admin/api/platform-admin-capabilities-api";
import { fetchPlatformAdminSummary } from "@/features/platform-admin/api/platform-admin-api";
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

vi.mock("@/features/platform-admin/api/platform-admin-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-api")>()),
  fetchPlatformAdminSummary: vi.fn(),
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
  client.setQueryData(platformAdminClubsQuery().queryKey, { items: [] });
  return client;
}

describe("adminShellLoaderFactory", () => {
  beforeEach(() => {
    vi.mocked(fetchAdminOperationCases).mockReset();
    vi.mocked(fetchPlatformAdminSummary).mockReset();
    vi.mocked(fetchPlatformAdminCapabilities).mockReset();
    vi.mocked(fetchPlatformAdminCapabilities).mockResolvedValue(capabilities);
  });

  it("fetches capabilities as an authoritative required query", async () => {
    const client = seededClient();

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

  it("does not prefetch operations or summary for a shell-owned command status", async () => {
    const client = seededClient();
    await expect(adminShellLoaderFactory(client)()).resolves.toMatchObject({
      authenticated: true,
    });
    expect(fetchAdminOperationCases).not.toHaveBeenCalled();
    expect(fetchPlatformAdminSummary).not.toHaveBeenCalled();
    expect(fetchPlatformAdminCapabilities).toHaveBeenCalledOnce();
    expect(client.getQueryData(platformAdminSummaryQuery().queryKey)).toBeUndefined();
  });

  it("does not prefetch the platform club list for the shell", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });

    await expect(adminShellLoaderFactory(client)()).resolves.toMatchObject({
      authenticated: true,
    });
    expect(client.getQueryData(platformAdminClubsQuery().queryKey)).toBeUndefined();
    expect(fetchAdminOperationCases).not.toHaveBeenCalled();
    expect(fetchPlatformAdminSummary).not.toHaveBeenCalled();
  });
});
