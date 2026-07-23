import { useLoaderData, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  feedbackDocumentQuery,
  hostFeedbackDocumentPreviewQuery,
} from "@/features/feedback/queries/feedback-queries";
import type { FeedbackDocumentRouteData } from "@/features/feedback/route/feedback-document-data";
import { readFeedbackReturnTarget } from "@/features/feedback/route/feedback-route-continuity";
import FeedbackDocumentPage, {
  FeedbackDocumentUnavailablePage,
} from "@/features/feedback/ui/feedback-document-page";
import { feedbackDocumentPdfDownloadsEnabled } from "@/shared/config/readmates-feature-flags";

export function FeedbackDocumentRoute({
  printMode = false,
  hostPreview = false,
}: {
  printMode?: boolean;
  hostPreview?: boolean;
}) {
  const { sessionId, unavailableReason } = useLoaderData() as FeedbackDocumentRouteData;
  const { clubSlug } = useParams();
  const documentQuery = useQuery({
    ...(hostPreview
      ? hostFeedbackDocumentPreviewQuery(sessionId ?? "", { clubSlug })
      : feedbackDocumentQuery(sessionId ?? "", { clubSlug })),
    enabled: Boolean(sessionId && !unavailableReason),
  });
  const result = unavailableReason
    ? { status: "unavailable" as const, reason: unavailableReason }
    : documentQuery.data;
  const location = useLocation();
  const returnTarget = readFeedbackReturnTarget(location.state);
  const effectivePrintMode = printMode && feedbackDocumentPdfDownloadsEnabled;

  if (!result) {
    return null;
  }

  return result.status === "ready" ? (
    <FeedbackDocumentPage
      document={result.document}
      printMode={effectivePrintMode}
      returnTarget={returnTarget}
      presentation={hostPreview ? "hostPreview" : "member"}
    />
  ) : (
    <FeedbackDocumentUnavailablePage
      reason={result.reason}
      printMode={effectivePrintMode}
      returnTarget={returnTarget}
      presentation={hostPreview ? "hostPreview" : "member"}
    />
  );
}

export function FeedbackDocumentPrintRoute() {
  return <FeedbackDocumentRoute printMode />;
}

export function HostFeedbackDocumentPreviewRoute() {
  return <FeedbackDocumentRoute hostPreview />;
}
