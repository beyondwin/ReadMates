import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  confirmForceCancelPlatformAdminAiJob,
  confirmRetryCommitPlatformAdminAiJob,
  fetchPlatformAdminAiGenerationCapabilities,
  fetchPlatformAdminAiOpsJob,
  fetchPlatformAdminAiOpsJobs,
  fetchPlatformAdminAiOpsSummary,
  previewForceCancelPlatformAdminAiJob,
  previewRetryCommitPlatformAdminAiJob,
} from "@/features/platform-admin/api/platform-admin-api";
import type {
  ConfirmPlatformAdminAiOpsCommandRequest,
  PlatformAdminAiOpsAction,
  PlatformAdminAiOpsFilters,
} from "@/features/platform-admin/api/platform-admin-contracts";

function normalizeFilters(filters: PlatformAdminAiOpsFilters = {}) {
  return {
    status: filters.status ?? null,
    clubId: filters.clubId ?? null,
    errorCode: filters.errorCode ?? null,
  };
}

export const platformAdminAiOpsKeys = {
  all: ["platform-admin", "ai-ops"] as const,
  capabilities: () => [...platformAdminAiOpsKeys.all, "capabilities"] as const,
  summary: (window?: string) => [...platformAdminAiOpsKeys.all, "summary", window ?? null] as const,
  jobs: (filters?: PlatformAdminAiOpsFilters) =>
    [...platformAdminAiOpsKeys.all, "jobs", normalizeFilters(filters)] as const,
  job: (jobId: string) => [...platformAdminAiOpsKeys.all, "job", jobId] as const,
} as const;

export function platformAdminAiGenerationCapabilitiesQuery() {
  return queryOptions({
    queryKey: platformAdminAiOpsKeys.capabilities(),
    queryFn: fetchPlatformAdminAiGenerationCapabilities,
    staleTime: 0,
  });
}

export function platformAdminAiOpsSummaryQuery(window?: string) {
  return queryOptions({
    queryKey: platformAdminAiOpsKeys.summary(window),
    queryFn: () => fetchPlatformAdminAiOpsSummary(window),
  });
}

export function platformAdminAiOpsJobsInfiniteQuery(filters: PlatformAdminAiOpsFilters = {}) {
  const normalized = Object.fromEntries(
    Object.entries(normalizeFilters(filters)).filter(([, value]) => value !== null),
  ) as PlatformAdminAiOpsFilters;
  return infiniteQueryOptions({
    queryKey: platformAdminAiOpsKeys.jobs(normalized),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchPlatformAdminAiOpsJobs(pageParam ? { ...normalized, cursor: pageParam } : normalized),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function platformAdminAiOpsJobQuery(jobId: string) {
  return queryOptions({
    queryKey: platformAdminAiOpsKeys.job(jobId),
    queryFn: () => fetchPlatformAdminAiOpsJob(jobId),
    enabled: Boolean(jobId),
  });
}

type AiOpsPreviewVariables = { jobId: string; action: PlatformAdminAiOpsAction };

export function usePreviewPlatformAdminAiJobCommandMutation() {
  return useMutation({
    mutationKey: [...platformAdminAiOpsKeys.all, "preview"],
    retry: 0,
    mutationFn: ({ jobId, action }: AiOpsPreviewVariables) =>
      action === "FORCE_CANCEL"
        ? previewForceCancelPlatformAdminAiJob(jobId)
        : previewRetryCommitPlatformAdminAiJob(jobId),
  });
}

type AiOpsConfirmVariables = AiOpsPreviewVariables & { request: ConfirmPlatformAdminAiOpsCommandRequest };

export function useConfirmPlatformAdminAiJobCommandMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...platformAdminAiOpsKeys.all, "confirm"],
    retry: 0,
    mutationFn: ({ jobId, action, request }: AiOpsConfirmVariables) =>
      action === "FORCE_CANCEL"
        ? confirmForceCancelPlatformAdminAiJob(jobId, request)
        : confirmRetryCommitPlatformAdminAiJob(jobId, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformAdminAiOpsKeys.all }),
  });
}
