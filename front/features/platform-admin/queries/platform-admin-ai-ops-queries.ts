import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchPlatformAdminAiOpsJobs,
  fetchPlatformAdminAiOpsSummary,
  forceCancelPlatformAdminAiJob,
  retryCommitPlatformAdminAiJob,
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
  summary: (window?: string) => [...platformAdminAiOpsKeys.all, "summary", window ?? null] as const,
  jobs: (filters?: PlatformAdminAiOpsFilters) =>
    [...platformAdminAiOpsKeys.all, "jobs", normalizeFilters(filters)] as const,
} as const;

export function platformAdminAiOpsSummaryQuery(window?: string) {
  return queryOptions({
    queryKey: platformAdminAiOpsKeys.summary(window),
    queryFn: () => fetchPlatformAdminAiOpsSummary(window),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformAdminAiOpsKeys.all }),
  });
}

export function useRetryCommitPlatformAdminAiJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => retryCommitPlatformAdminAiJob(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformAdminAiOpsKeys.all }),
  });
}
