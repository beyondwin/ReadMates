import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation } from "@tanstack/react-query";
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
  return useMutation({
    mutationFn: (scheduleRevision: number) => markCurrentScheduleSeen(scheduleRevision, context),
  });
}

export function publishCurrentScheduleSeen(
  client: QueryClient,
  context: ReadmatesApiContext | undefined,
  receipt: Awaited<ReturnType<typeof markCurrentScheduleSeen>>,
) {
  client.setQueryData<CurrentSessionResponse>(currentSessionKeys.current(context), (current) => {
    if (!current?.currentSession || current.currentSession.scheduleRevision !== receipt.scheduleRevision) return current;
    return {
      ...current,
      currentSession: { ...current.currentSession, mySeenScheduleRevision: receipt.scheduleRevision, myScheduleSeenAt: receipt.seenAt },
    };
  });
}

export function useUpdateCurrentSessionRsvpMutation(context?: ReadmatesApiContext) {
  return useMutation({
    mutationFn: async (status: Exclude<RsvpStatus, "NO_RESPONSE">) => {
      await requireOk(await updateCurrentSessionRsvp(status, context));
    },
  });
}

export function useSaveCurrentSessionCheckinMutation(context?: ReadmatesApiContext) {
  return useMutation({
    mutationFn: async (readingProgress: number) => {
      await requireOk(await saveCurrentSessionCheckin(readingProgress, context));
    },
  });
}

export function useSaveCurrentSessionQuestionsMutation(context?: ReadmatesApiContext) {
  return useMutation({
    mutationFn: async (questions: CurrentSessionQuestionPayloadItem[]) => {
      await requireOk(await saveCurrentSessionQuestions(questions, context));
    },
  });
}

export function useSaveCurrentSessionLongReviewMutation(context?: ReadmatesApiContext) {
  return useMutation({
    mutationFn: async (body: string) => {
      await requireOk(await saveCurrentSessionLongReview(body, context));
    },
  });
}

export function useSaveCurrentSessionOneLineReviewMutation(context?: ReadmatesApiContext) {
  return useMutation({
    mutationFn: async (text: string) => {
      await requireOk(await saveCurrentSessionOneLineReview(text, context));
    },
  });
}
