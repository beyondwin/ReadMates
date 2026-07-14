import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cancelGeneration,
  commitGeneration,
  getAvailableModels,
  getJob,
  getRecentJob,
  regenerateItem,
  startGeneration,
} from "@/features/host/aigen/api/aigen-api";
import type {
  AiGenerationJobResponse,
  CommitGenerationRequest,
  RegenerateRequest,
  StartGenerationRequest,
} from "@/features/host/aigen/api/aigen-contracts";
import { invalidateHostSessionRecordSurfaces } from "@/features/host/queries/host-session-queries";
import type { ReadmatesApiContext } from "@/shared/api/client";

export const aiJobKeys = {
  all: ["host", "aigen", "jobs"] as const,
  session: (sessionId: string) => [...aiJobKeys.all, "session", sessionId] as const,
  recent: (sessionId: string) => [...aiJobKeys.session(sessionId), "recent"] as const,
  detail: (sessionId: string, jobId: string) =>
    [...aiJobKeys.session(sessionId), "detail", jobId] as const,
  models: (sessionId: string) => [...aiJobKeys.session(sessionId), "models"] as const,
} as const;

const RECENT_JOB_POLL_INTERVAL_MS = 4000;
const RECENT_JOB_STABLE_STATUSES: ReadonlySet<AiGenerationJobResponse["status"]> = new Set([
  "SUCCEEDED",
  "FAILED",
  "COMMITTED",
  "CANCELLED",
]);

export function recentAiJobQuery(sessionId: string) {
  return queryOptions({
    queryKey: aiJobKeys.recent(sessionId),
    queryFn: () => getRecentJob(sessionId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return RECENT_JOB_STABLE_STATUSES.has(data.status) ? false : RECENT_JOB_POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
  });
}

export function aiJobDetailQuery(sessionId: string, jobId: string) {
  return queryOptions({
    queryKey: aiJobKeys.detail(sessionId, jobId),
    queryFn: () => getJob(sessionId, jobId),
  });
}

export function availableAiModelsQuery(sessionId: string) {
  return queryOptions({
    queryKey: aiJobKeys.models(sessionId),
    queryFn: () => getAvailableModels(sessionId),
  });
}

export function useStartAiJobMutation(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: StartGenerationRequest) => startGeneration(sessionId, request),
    onSuccess: () => client.invalidateQueries({ queryKey: aiJobKeys.session(sessionId) }),
  });
}

export function useCancelAiJobMutation(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => cancelGeneration(sessionId, jobId),
    onSuccess: () => client.invalidateQueries({ queryKey: aiJobKeys.session(sessionId) }),
  });
}

export function useRegenerateAiItemMutation(sessionId: string, jobId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: RegenerateRequest) => regenerateItem(sessionId, jobId, request),
    onSuccess: () => client.invalidateQueries({ queryKey: aiJobKeys.detail(sessionId, jobId) }),
  });
}

export function useCommitAiJobMutation(
  sessionId: string,
  jobId: string,
  context?: ReadmatesApiContext,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: CommitGenerationRequest) => commitGeneration(sessionId, jobId, request),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: aiJobKeys.session(sessionId) }),
        invalidateHostSessionRecordSurfaces(client, sessionId, context),
      ]);
    },
  });
}
