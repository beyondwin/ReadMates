import { readmatesFetch } from "@/shared/api/client";
import { parseAdminAnalyticsOverview } from "@/features/platform-admin/api/platform-admin-analytics-contracts";
import {
  analyticsSearchFromWindow,
  type AdminAnalyticsOverview,
  type AnalyticsWindow,
} from "@/features/platform-admin/model/platform-admin-analytics-model";

export function fetchAdminAnalyticsOverview(window: AnalyticsWindow) {
  return readmatesFetch<AdminAnalyticsOverview>(
    `/api/admin/analytics/overview?${analyticsSearchFromWindow(window).toString()}`,
    undefined,
    { clubSlug: undefined },
  ).then(parseAdminAnalyticsOverview);
}
