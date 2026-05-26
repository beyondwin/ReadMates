import type { QueryClient } from "@tanstack/react-query";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { ReadmatesApiError } from "@/shared/api/errors";

const disabledAiSummary = {
  activeJobCount: 0,
  failedLast24h: 0,
  monthToDateCostEstimateUsd: "0.0000",
  failureCodes: [],
  providerCosts: [],
  staleCandidateCount: 0,
};

const emptyAiJobs = { items: [], nextCursor: null };

export function adminTodayLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminToday() {
    await Promise.all([
      queryClient.fetchQuery(platformAdminSummaryQuery()),
      queryClient.fetchQuery(platformAdminClubsQuery()),
      loadOptionalAiOps(queryClient),
    ]);
    return null;
  };
}

async function loadOptionalAiOps(queryClient: QueryClient) {
  const summaryQuery = platformAdminAiOpsSummaryQuery();
  const jobsQuery = platformAdminAiOpsJobsQuery();
  try {
    await Promise.all([
      queryClient.fetchQuery(summaryQuery),
      queryClient.fetchQuery(jobsQuery),
    ]);
  } catch (error) {
    if (!(error instanceof ReadmatesApiError) || error.status !== 503) {
      throw error;
    }
    queryClient.setQueryData(summaryQuery.queryKey, disabledAiSummary);
    queryClient.setQueryData(jobsQuery.queryKey, emptyAiJobs);
  }
}
