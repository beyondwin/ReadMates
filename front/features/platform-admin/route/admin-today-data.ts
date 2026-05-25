import type { QueryClient } from "@tanstack/react-query";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";

export function adminTodayLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminToday() {
    await Promise.all([
      queryClient.fetchQuery(platformAdminSummaryQuery()),
      queryClient.fetchQuery(platformAdminClubsQuery()),
      queryClient.fetchQuery(platformAdminAiOpsSummaryQuery()),
      queryClient.fetchQuery(platformAdminAiOpsJobsQuery()),
    ]);
    return null;
  };
}
