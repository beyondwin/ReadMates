import type { QueryClient } from "@tanstack/react-query";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";

export function adminAiOpsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminAiOps() {
    await Promise.all([
      queryClient.fetchQuery(platformAdminAiOpsSummaryQuery()),
      queryClient.fetchQuery(platformAdminAiOpsJobsQuery()),
    ]);
    return null;
  };
}
