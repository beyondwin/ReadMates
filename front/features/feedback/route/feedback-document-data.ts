import type { LoaderFunctionArgs } from "react-router-dom";
import { fetchFeedbackDocument, type FeedbackLoadResult } from "@/features/feedback/api/feedback-api";
import { clubSlugFromLoaderArgs, loadMemberAppAuth } from "@/shared/auth/member-app-loader";

export type FeedbackDocumentRouteData = FeedbackLoadResult;

export async function feedbackDocumentLoader({ params }: LoaderFunctionArgs): Promise<FeedbackDocumentRouteData> {
  const access = await loadMemberAppAuth({ params });

  if (!access.allowed) {
    return { status: "unavailable", reason: "forbidden" };
  }

  const sessionId = params.sessionId;

  if (!sessionId) {
    return { status: "unavailable", reason: "missing" };
  }

  return fetchFeedbackDocument(sessionId, { clubSlug: clubSlugFromLoaderArgs({ params }) });
}
