import { queryOptions } from "@tanstack/react-query";
import { fetchAdminAnalyticsOverview } from "@/features/platform-admin/api/platform-admin-analytics-api";
import type { AnalyticsWindow } from "@/features/platform-admin/model/platform-admin-analytics-model";

export const platformAdminAnalyticsKeys = {
  all: ["platform-admin", "analytics"] as const,
  overview: (window: AnalyticsWindow) => [...platformAdminAnalyticsKeys.all, "overview", window] as const,
} as const;

export function platformAdminAnalyticsOverviewQuery(window: AnalyticsWindow) {
  return queryOptions({
    queryKey: platformAdminAnalyticsKeys.overview(window),
    queryFn: () => fetchAdminAnalyticsOverview(window),
  });
}
