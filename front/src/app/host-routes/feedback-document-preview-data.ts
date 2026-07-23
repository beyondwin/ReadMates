import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import type { FeedbackLoadResult } from "@/features/feedback/api/feedback-api";
import { hostFeedbackDocumentPreviewQuery } from "@/features/feedback/queries/feedback-queries";
import { requireHostLoaderAuth } from "@/features/host/route/host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export type HostFeedbackDocumentPreviewRouteData = {
  sessionId: string | null;
  unavailableReason?: Extract<FeedbackLoadResult, { status: "unavailable" }>["reason"];
};

export function hostFeedbackDocumentPreviewLoaderFactory(queryClient: QueryClient) {
  return async function hostFeedbackDocumentPreviewLoader(
    args: LoaderFunctionArgs,
  ): Promise<HostFeedbackDocumentPreviewRouteData> {
    await requireHostLoaderAuth(args);

    const sessionId = args.params.sessionId ?? null;
    if (!sessionId) {
      return { sessionId, unavailableReason: "missing" };
    }

    const context = { clubSlug: clubSlugFromLoaderArgs(args) };
    await queryClient.ensureQueryData(hostFeedbackDocumentPreviewQuery(sessionId, context));

    return { sessionId };
  };
}
