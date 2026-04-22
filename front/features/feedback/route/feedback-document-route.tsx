import { useLoaderData, useLocation } from "react-router-dom";
import type { FeedbackDocumentRouteData } from "@/features/feedback/route/feedback-document-data";
import { readFeedbackReturnTarget } from "@/features/feedback/route/feedback-route-continuity";
import FeedbackDocumentPage, {
  FeedbackDocumentUnavailablePage,
} from "@/features/feedback/ui/feedback-document-page";

export function FeedbackDocumentRoute({ printMode = false }: { printMode?: boolean }) {
  const result = useLoaderData() as FeedbackDocumentRouteData;
  const location = useLocation();
  const returnTarget = readFeedbackReturnTarget(location.state);

  return result.status === "ready" ? (
    <FeedbackDocumentPage document={result.document} printMode={printMode} returnTarget={returnTarget} />
  ) : (
    <FeedbackDocumentUnavailablePage reason={result.reason} printMode={printMode} returnTarget={returnTarget} />
  );
}

export function FeedbackDocumentPrintRoute() {
  return <FeedbackDocumentRoute printMode />;
}
