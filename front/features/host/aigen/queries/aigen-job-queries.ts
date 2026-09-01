import { queryOptions, useMutation, type QueryClient } from "@tanstack/react-query";
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
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import { hostClubQueryPrefix, hostMutationKey } from "@/features/host/queries/host-state-purge";

export const aiJobKeys = {
  scope: (context: ExplicitReadmatesApiContext) =>
    [...hostClubQueryPrefix(context.clubSlug), "aigen", "jobs"] as const,
  session: (sessionId: string, context: ExplicitReadmatesApiContext) =>
    [...aiJobKeys.scope(context), "session", sessionId] as const,
  recent: (sessionId: string, context: ExplicitReadmatesApiContext) =>
    [...aiJobKeys.session(sessionId, context), "recent"] as const,
  detail: (sessionId: string, jobId: string, context: ExplicitReadmatesApiContext) =>
    [...aiJobKeys.session(sessionId, context), "detail", jobId] as const,
  models: (sessionId: string, context: ExplicitReadmatesApiContext) =>
    [...aiJobKeys.session(sessionId, context), "models"] as const,
} as const;

export const aiClubKeys = {
  scope: (context: ExplicitReadmatesApiContext) =>
    [...hostClubQueryPrefix(context.clubSlug), "aigen", "club"] as const,
  capabilities: (context: ExplicitReadmatesApiContext) =>
    [...aiClubKeys.scope(context), "capabilities"] as const,
  defaults: (context: ExplicitReadmatesApiContext) =>
    [...aiClubKeys.scope(context), "default"] as const,
} as const;

const RECENT_JOB_POLL_INTERVAL_MS = 4000;
const RECENT_JOB_STABLE_STATUSES: ReadonlySet<AiGenerationJobResponse["status"]> = new Set([
  "SUCCEEDED",
  "FAILED",
  "COMMITTED",
  "CANCELLED",
]);

export function recentAiJobQuery(sessionId: string, context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: aiJobKeys.recent(sessionId, context),
    queryFn: () => getRecentJob(sessionId, context),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return RECENT_JOB_STABLE_STATUSES.has(data.status) ? false : RECENT_JOB_POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
  });
}

export function aiJobDetailQuery(sessionId: string, jobId: string, context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: aiJobKeys.detail(sessionId, jobId, context),
    queryFn: () => getJob(sessionId, jobId, context),
  });
}

export function availableAiModelsQuery(sessionId: string, context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: aiJobKeys.models(sessionId, context),
    queryFn: () => getAvailableModels(sessionId, context),
  });
}

export function useStartAiJobMutation(sessionId: string, context: ExplicitReadmatesApiContext) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "aigen", "start"),
    mutationFn: (request: StartGenerationRequest) => startGeneration(sessionId, request, context),
  });
}

export function useCancelAiJobMutation(sessionId: string, context: ExplicitReadmatesApiContext) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "aigen", "cancel"),
    mutationFn: (jobId: string) => cancelGeneration(sessionId, jobId, context),
  });
}

export function useRegenerateAiItemMutation(
  sessionId: string,
  jobId: string,
  context: ExplicitReadmatesApiContext,
) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "aigen", "regenerate"),
    mutationFn: (request: RegenerateRequest) => regenerateItem(sessionId, jobId, request, context),
  });
}

export function useCommitAiJobMutation(
  sessionId: string,
  jobId: string,
  context: ExplicitReadmatesApiContext,
) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "aigen", "commit"),
    mutationFn: (request: CommitGenerationRequest) => commitGeneration(sessionId, jobId, request, context),
  });
}

export async function publishAiJobSession(client: QueryClient, sessionId: string, context: ExplicitReadmatesApiContext) {
  await client.invalidateQueries({ queryKey: aiJobKeys.session(sessionId, context) });
}

export async function publishAiJobDetail(client: QueryClient, sessionId: string, jobId: string, context: ExplicitReadmatesApiContext) {
  await client.invalidateQueries({ queryKey: aiJobKeys.detail(sessionId, jobId, context) });
}

export async function publishCommittedAiJob(client: QueryClient, sessionId: string, context: ExplicitReadmatesApiContext) {
  await Promise.all([
    publishAiJobSession(client, sessionId, context),
    invalidateHostSessionRecordSurfaces(client, sessionId, context),
  ]);
}
