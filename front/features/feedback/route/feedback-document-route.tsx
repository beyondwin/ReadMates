import { useLoaderData, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { feedbackDocumentQuery } from "@/features/feedback/queries/feedback-queries";
import type { FeedbackDocumentRouteData } from "@/features/feedback/route/feedback-document-data";
import { readFeedbackReturnTarget } from "@/features/feedback/route/feedback-route-continuity";
import FeedbackDocumentPage, {
  FeedbackDocumentUnavailablePage,
} from "@/features/feedback/ui/feedback-document-page";
import { feedbackDocumentPdfDownloadsEnabled } from "@/shared/config/readmates-feature-flags";

export function FeedbackDocumentRoute({ printMode = false }: { printMode?: boolean }) {
  const { sessionId, unavailableReason } = useLoaderData() as FeedbackDocumentRouteData;
  const { clubSlug } = useParams();
  const documentQuery = useQuery({
    ...feedbackDocumentQuery(sessionId ?? "", { clubSlug }),
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
    <FeedbackDocumentPage document={result.document} printMode={effectivePrintMode} returnTarget={returnTarget} />
  ) : (
    <FeedbackDocumentUnavailablePage reason={result.reason} printMode={effectivePrintMode} returnTarget={returnTarget} />
  );
}

export function FeedbackDocumentPrintRoute() {
  return <FeedbackDocumentRoute printMode />;
}
