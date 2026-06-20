import type { QueryClient } from "@tanstack/react-query";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  platformAdminClubsQuery,
  platformAdminKeys,
  platformAdminSummaryQuery,
  platformAdminTodayClosingRisksQuery,
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

const emptyClosingRisks = {
  schema: "admin.today_closing_risks.v1" as const,
  generatedAt: "1970-01-01T00:00:00.000Z",
  items: [],
};

export function adminTodayLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminToday() {
    await Promise.all([
      queryClient.fetchQuery(platformAdminSummaryQuery()),
      queryClient.fetchQuery(platformAdminClubsQuery()),
      loadOptionalAiOps(queryClient),
      loadOptionalClosingRisks(queryClient),
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

async function loadOptionalClosingRisks(queryClient: QueryClient) {
  const closingRisksQuery = platformAdminTodayClosingRisksQuery();
  try {
    await queryClient.fetchQuery(closingRisksQuery);
    queryClient.setQueryData(platformAdminKeys.todayClosingRisksUnavailable(), false);
  } catch (error) {
    if (!(error instanceof ReadmatesApiError)) {
      throw error;
    }
    queryClient.setQueryData(closingRisksQuery.queryKey, emptyClosingRisks);
    queryClient.setQueryData(platformAdminKeys.todayClosingRisksUnavailable(), true);
  }
}
