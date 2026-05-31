import { readmatesFetch } from "@/shared/api/client";
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
  );
}
