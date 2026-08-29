import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCurrentSession,
  markCurrentScheduleSeen,
  saveCurrentSessionCheckin,
  saveCurrentSessionLongReview,
  saveCurrentSessionOneLineReview,
  saveCurrentSessionQuestions,
  updateCurrentSessionRsvp,
} from "@/features/current-session/api/current-session-api";
import type {
  CurrentSessionResponse,
  RsvpStatus,
} from "@/features/current-session/api/current-session-contracts";
import type { CurrentSessionQuestionPayloadItem } from "@/features/current-session/model/current-session-form-model";
import type { ReadmatesApiContext, ReadmatesRequestPolicy } from "@/shared/api/client";
import { isReadmatesApiError } from "@/shared/api/errors";

function scopeKey(context?: ReadmatesApiContext): string | null {
  return context?.clubSlug ?? null;
}

async function requireOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error("Current session save failed");
  }
}

export const currentSessionKeys = {
  all: ["current-session"] as const,
  scope: (context?: ReadmatesApiContext) => [...currentSessionKeys.all, "scope", scopeKey(context)] as const,
  current: (context?: ReadmatesApiContext) => [...currentSessionKeys.scope(context), "current"] as const,
} as const;

export function currentSessionQuery(
  context?: ReadmatesApiContext,
  policy?: ReadmatesRequestPolicy,
) {
  return queryOptions({
    queryKey: currentSessionKeys.current(context),
    queryFn: () => policy ? getCurrentSession(context, policy) : getCurrentSession(context),
  });
}

export function invalidateCurrentSession(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: currentSessionKeys.scope(context) });
}

export function isCurrentScheduleSeenConflict(error: unknown) {
  return isReadmatesApiError(error) && error.status === 409;
}

export function useMarkCurrentScheduleSeenMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  const queryKey = currentSessionKeys.current(context);

  return useMutation({
    mutationFn: (scheduleRevision: number) => markCurrentScheduleSeen(scheduleRevision, context),
    onSuccess: (receipt) => {
      client.setQueryData<CurrentSessionResponse>(queryKey, (current) => {
        if (!current?.currentSession || current.currentSession.scheduleRevision !== receipt.scheduleRevision) {
          return current;
        }

        return {
          ...current,
          currentSession: {
            ...current.currentSession,
            mySeenScheduleRevision: receipt.scheduleRevision,
            myScheduleSeenAt: receipt.seenAt,
          },
        };
      });
    },
    onError: (error) => {
      if (isCurrentScheduleSeenConflict(error)) {
        return invalidateCurrentSession(client, context);
      }
    },
  });
}

export function useUpdateCurrentSessionRsvpMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (status: Exclude<RsvpStatus, "NO_RESPONSE">) => {
      await requireOk(await updateCurrentSessionRsvp(status, context));
    },
    onSuccess: () => invalidateCurrentSession(client, context),
  });
}

export function useSaveCurrentSessionCheckinMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (readingProgress: number) => {
      await requireOk(await saveCurrentSessionCheckin(readingProgress, context));
    },
    onSuccess: () => invalidateCurrentSession(client, context),
  });
}

export function useSaveCurrentSessionQuestionsMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (questions: CurrentSessionQuestionPayloadItem[]) => {
      await requireOk(await saveCurrentSessionQuestions(questions, context));
    },
    onSuccess: () => invalidateCurrentSession(client, context),
  });
}

export function useSaveCurrentSessionLongReviewMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      await requireOk(await saveCurrentSessionLongReview(body, context));
    },
    onSuccess: () => invalidateCurrentSession(client, context),
  });
}

export function useSaveCurrentSessionOneLineReviewMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      await requireOk(await saveCurrentSessionOneLineReview(text, context));
    },
    onSuccess: () => invalidateCurrentSession(client, context),
  });
}
