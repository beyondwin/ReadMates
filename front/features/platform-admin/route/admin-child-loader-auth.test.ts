import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";
import { adminAiOpsLoaderFactory } from "./admin-ai-ops-data";
import { adminAnalyticsLoaderFactory } from "./admin-analytics-data";
import { adminAuditLoaderFactory } from "./admin-audit-data";
import { adminClubDetailLoaderFactory } from "./admin-club-detail-data";
import { adminClubsLoaderFactory } from "./admin-clubs-data";
import { adminHealthLoaderFactory } from "./admin-health-data";
import { adminNotificationsLoaderFactory } from "./admin-notifications-data";
import { adminSupportLoaderFactory } from "./admin-support-data";
import { adminTodayLoaderFactory } from "./admin-today-data";

vi.mock("@/shared/auth/platform-admin-loader", () => ({
  requirePlatformAdminLoaderAuth: vi.fn(),
}));

const LOADERS = [
  ["today", adminTodayLoaderFactory, "/admin/today"],
  ["clubs", adminClubsLoaderFactory, "/admin/clubs"],
  ["health", adminHealthLoaderFactory, "/admin/health"],
  ["audit", adminAuditLoaderFactory, "/admin/audit"],
  ["notifications", adminNotificationsLoaderFactory, "/admin/notifications"],
  ["ai-ops", adminAiOpsLoaderFactory, "/admin/ai-ops"],
  ["analytics", adminAnalyticsLoaderFactory, "/admin/analytics"],
  ["support", adminSupportLoaderFactory, "/admin/support"],
  ["club-detail", adminClubDetailLoaderFactory, "/admin/clubs/club-sample-reading"],
] as const;

describe("Admin child loaders", () => {
  it.each(LOADERS)("does not prefetch %s when platform-admin auth is rejected", async (_name, create, path) => {
    vi.mocked(requirePlatformAdminLoaderAuth).mockRejectedValue(new Error("redirect /app"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fetchQuery = vi.spyOn(client, "fetchQuery").mockResolvedValue({});
    const fetchInfiniteQuery = vi.spyOn(client, "fetchInfiniteQuery").mockResolvedValue({} as never);
    const prefetchInfiniteQuery = vi.spyOn(client, "prefetchInfiniteQuery").mockResolvedValue();

    await expect(create(client)({
      request: new Request(`https://readmates.example${path}`),
      params: { clubId: "club-sample-reading" },
      context: undefined,
    } as never)).rejects.toThrow("redirect /app");

    expect(fetchQuery).not.toHaveBeenCalled();
    expect(fetchInfiniteQuery).not.toHaveBeenCalled();
    expect(prefetchInfiniteQuery).not.toHaveBeenCalled();
  });
});
