import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { analyticsWindowFromSearchParams } from "@/features/platform-admin/model/platform-admin-analytics-model";
import { platformAdminAnalyticsOverviewQuery } from "@/features/platform-admin/queries/platform-admin-analytics-queries";

export function adminAnalyticsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminAnalytics(args?: LoaderFunctionArgs) {
    const window = args
      ? analyticsWindowFromSearchParams(new URL(args.request.url).searchParams)
      : "30d";
    await queryClient.fetchQuery(platformAdminAnalyticsOverviewQuery(window));
    return null;
  };
}
