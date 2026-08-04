import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { fetchAdminOperationCases } from "@/features/platform-admin/api/platform-admin-operations-api";

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

import { adminShellLoaderFactory } from "./admin-shell-data";

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
  });

  it("prefetches the optional operations summary without making its failure route-fatal", async () => {
    vi.mocked(fetchAdminOperationCases).mockRejectedValue(new Error("operations unavailable"));

    await expect(adminShellLoaderFactory(seededClient())()).resolves.toMatchObject({
      authenticated: true,
    });
    expect(fetchAdminOperationCases).toHaveBeenCalledOnce();
  });
});
