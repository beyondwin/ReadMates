import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import {
  fetchFeedbackDocument,
  fetchHostFeedbackDocumentPreview,
  type FeedbackLoadResult,
} from "@/features/feedback/api/feedback-api";
import type { ReadmatesApiContext } from "@/shared/api/client";

function scopeKey(context?: ReadmatesApiContext): string | null {
  return context?.clubSlug ?? null;
}

export const feedbackKeys = {
  all: ["feedback"] as const,
  scope: (context?: ReadmatesApiContext) => [...feedbackKeys.all, "scope", scopeKey(context)] as const,
  document: (sessionId: string, context?: ReadmatesApiContext) =>
    [...feedbackKeys.scope(context), "document", sessionId] as const,
  hostPreview: (sessionId: string, context?: ReadmatesApiContext) =>
    [...feedbackKeys.scope(context), "host-preview", sessionId] as const,
} as const;

export function feedbackDocumentQuery(sessionId: string, context?: ReadmatesApiContext) {
  return queryOptions<FeedbackLoadResult>({
    queryKey: feedbackKeys.document(sessionId, context),
    queryFn: () => fetchFeedbackDocument(sessionId, context),
  });
}

export function hostFeedbackDocumentPreviewQuery(
  sessionId: string,
  context?: ReadmatesApiContext,
) {
  return queryOptions<FeedbackLoadResult>({
    queryKey: feedbackKeys.hostPreview(sessionId, context),
    queryFn: () => fetchHostFeedbackDocumentPreview(sessionId, context),
  });
}

export function invalidateFeedbackQueries(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: feedbackKeys.scope(context) });
}
