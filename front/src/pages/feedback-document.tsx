import { useCallback } from "react";
import { useParams } from "react-router-dom";
import FeedbackDocumentPage, {
  FeedbackDocumentUnavailablePage,
} from "@/features/feedback/components/feedback-document-page";
import type { FeedbackDocumentResponse } from "@/shared/api/readmates";
import { readmatesFetchResponse } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

type FeedbackLoadResult =
  | { status: "ready"; document: FeedbackDocumentResponse }
  | { status: "unavailable"; reason: "forbidden" | "missing" };

async function loadFeedbackDocument(sessionId: string): Promise<FeedbackLoadResult> {
  const response = await readmatesFetchResponse(`/api/sessions/${encodeURIComponent(sessionId)}/feedback-document`);

  if (response.status === 403) {
    return { status: "unavailable", reason: "forbidden" };
  }

  if (response.status === 404) {
    return { status: "unavailable", reason: "missing" };
  }

  if (!response.ok) {
    throw new Error(`ReadMates feedback document fetch failed: ${sessionId} (${response.status})`);
  }

  return { status: "ready", document: (await response.json()) as FeedbackDocumentResponse };
}

export default function FeedbackDocumentRoutePage({ printMode = false }: { printMode?: boolean }) {
  const sessionId = useParams().sessionId;
  const state = useReadmatesData(
    useCallback(() => {
      if (!sessionId) {
        return Promise.resolve<FeedbackLoadResult>({ status: "unavailable", reason: "missing" });
      }
      return loadFeedbackDocument(sessionId);
    }, [sessionId]),
  );

  return (
    <ReadmatesPageState state={state}>
      {(result) =>
        result.status === "ready" ? (
          <FeedbackDocumentPage document={result.document} printMode={printMode} />
        ) : (
          <FeedbackDocumentUnavailablePage reason={result.reason} printMode={printMode} />
        )
      }
    </ReadmatesPageState>
  );
}
