import type { LoaderFunctionArgs } from "react-router-dom";
import { fetchFeedbackDocument, type FeedbackLoadResult } from "@/features/feedback/api/feedback-api";

export type FeedbackDocumentRouteData = FeedbackLoadResult;

export function feedbackDocumentLoader({ params }: LoaderFunctionArgs): Promise<FeedbackDocumentRouteData> {
  const sessionId = params.sessionId;

  if (!sessionId) {
    return Promise.resolve({ status: "unavailable", reason: "missing" });
  }

  return fetchFeedbackDocument(sessionId);
}
