import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchPlatformAdminAiOpsJobs,
  fetchPlatformAdminAiOpsSummary,
  forceCancelPlatformAdminAiJob,
} from "@/features/platform-admin/api/platform-admin-api";
import type { PlatformAdminAiOpsFilters } from "@/features/platform-admin/api/platform-admin-contracts";

function normalizeFilters(filters: PlatformAdminAiOpsFilters = {}) {
  return {
    status: filters.status ?? null,
    clubId: filters.clubId ?? null,
    errorCode: filters.errorCode ?? null,
    cursor: filters.cursor ?? null,
  };
}

export const platformAdminAiOpsKeys = {
  all: ["platform-admin", "ai-ops"] as const,
  summary: () => [...platformAdminAiOpsKeys.all, "summary"] as const,
  jobs: (filters?: PlatformAdminAiOpsFilters) =>
    [...platformAdminAiOpsKeys.all, "jobs", normalizeFilters(filters)] as const,
} as const;

export function platformAdminAiOpsSummaryQuery() {
  return queryOptions({
    queryKey: platformAdminAiOpsKeys.summary(),
    queryFn: fetchPlatformAdminAiOpsSummary,
  });
}

export function platformAdminAiOpsJobsQuery(filters?: PlatformAdminAiOpsFilters) {
  return queryOptions({
    queryKey: platformAdminAiOpsKeys.jobs(filters),
    queryFn: () => fetchPlatformAdminAiOpsJobs(filters),
  });
}

export function useForceCancelPlatformAdminAiJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => forceCancelPlatformAdminAiJob(jobId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: platformAdminAiOpsKeys.summary() }),
        queryClient.invalidateQueries({ queryKey: platformAdminAiOpsKeys.all }),
      ]),
  });
}
