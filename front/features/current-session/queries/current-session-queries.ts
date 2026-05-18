import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCurrentSession,
  saveCurrentSessionCheckin,
  saveCurrentSessionLongReview,
  saveCurrentSessionOneLineReview,
  saveCurrentSessionQuestions,
  updateCurrentSessionRsvp,
} from "@/features/current-session/api/current-session-api";
import type { RsvpStatus } from "@/features/current-session/api/current-session-contracts";
import type { CurrentSessionQuestionPayloadItem } from "@/features/current-session/model/current-session-form-model";
import type { ReadmatesApiContext } from "@/shared/api/client";

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

export function currentSessionQuery(context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: currentSessionKeys.current(context),
    queryFn: () => getCurrentSession(context),
  });
}

export function invalidateCurrentSession(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: currentSessionKeys.scope(context) });
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
