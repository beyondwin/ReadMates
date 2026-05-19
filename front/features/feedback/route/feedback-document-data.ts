import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import type { FeedbackLoadResult } from "@/features/feedback/api/feedback-api";
import { feedbackDocumentQuery } from "@/features/feedback/queries/feedback-queries";
import { clubSlugFromLoaderArgs, loadMemberAppAuth } from "@/shared/auth/member-app-loader";

export type FeedbackDocumentRouteData = {
  sessionId: string | null;
  unavailableReason?: Extract<FeedbackLoadResult, { status: "unavailable" }>["reason"];
};

function contextFromArgs(args: LoaderFunctionArgs) {
  return { clubSlug: clubSlugFromLoaderArgs(args) };
}

export function feedbackDocumentLoaderFactory(queryClient: QueryClient) {
  return async function feedbackDocumentLoader(args: LoaderFunctionArgs): Promise<FeedbackDocumentRouteData> {
    const { params } = args;
    const access = await loadMemberAppAuth(args);
    const sessionId = params.sessionId ?? null;

    if (!access.allowed) {
      return { sessionId, unavailableReason: "forbidden" };
    }

    if (!sessionId) {
      return { sessionId, unavailableReason: "missing" };
    }

    await queryClient.ensureQueryData(feedbackDocumentQuery(sessionId, contextFromArgs(args)));

    return { sessionId };
  };
}
