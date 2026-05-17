/**
 * Polling hook for an AI generation job (design doc §7.2).
 *
 * Polls `GET /api/host/sessions/{sessionId}/ai-generate/jobs/{jobId}` until
 * the job reaches a terminal status. Spec calls for an initial poll
 * at ~2s, then 3–5s subsequently. We use a single deterministic
 * constant of 4000 ms for "subsequent" polls for predictability.
 *
 * - First scheduled refetch (data update count <= 1): 2000 ms.
 * - Subsequent refetches: 4000 ms.
 * - Terminal statuses (FAILED / CANCELLED / COMMITTED): stop polling.
 *
 * `enabled` is auto-disabled when `jobId` is null/undefined so the hook is
 * safe to mount before the job has been created.
 */

import type { Query, UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { getJob } from "@/features/host/aigen/api/aigen-api";
import type { AiGenerationJobResponse } from "@/features/host/aigen/api/aigen-contracts";

const FIRST_POLL_MS = 2000;
const SUBSEQUENT_POLL_MS = 4000;

const TERMINAL_STATUSES: ReadonlySet<AiGenerationJobResponse["status"]> = new Set([
  "FAILED",
  "CANCELLED",
  "COMMITTED",
]);

const JOBS_ROOT = ["host", "aigen", "jobs"] as const;

export const aiGenerationJobKeys = {
  all: JOBS_ROOT,
  detail: (sessionId: string, jobId: string) =>
    [...JOBS_ROOT, sessionId, jobId] as const,
} as const;

export type UseAiGenerationJobOptions = {
  enabled?: boolean;
};

export function useAiGenerationJob(
  sessionId: string,
  jobId: string | null | undefined,
  options: UseAiGenerationJobOptions = {},
): UseQueryResult<AiGenerationJobResponse> {
  const enabledOption = options.enabled ?? true;
  const enabled = enabledOption && typeof jobId === "string" && jobId.length > 0;

  return useQuery({
    queryKey: aiGenerationJobKeys.detail(sessionId, jobId ?? ""),
    queryFn: () => {
      // Safe: `enabled` guarantees jobId is a non-empty string before queryFn runs.
      return getJob(sessionId, jobId as string);
    },
    enabled,
    refetchInterval: (query: Query<AiGenerationJobResponse, Error>) => {
      const status = query.state.data?.status;
      if (status && TERMINAL_STATUSES.has(status)) {
        return false;
      }
      // dataUpdateCount counts successful data updates; the first scheduled
      // refetch fires after the initial fetch resolves (count == 1) at 2s.
      // Subsequent polls (count >= 2) use 4s.
      return query.state.dataUpdateCount <= 1 ? FIRST_POLL_MS : SUBSEQUENT_POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
}
