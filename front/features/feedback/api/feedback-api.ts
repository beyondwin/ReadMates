import { readmatesFetchResponse } from "@/shared/api/client";
import type { FeedbackDocumentResponse } from "@/features/feedback/api/feedback-contracts";

export type FeedbackLoadResult =
  | { status: "ready"; document: FeedbackDocumentResponse }
  | { status: "unavailable"; reason: "forbidden" | "missing" };

export async function fetchFeedbackDocument(sessionId: string): Promise<FeedbackLoadResult> {
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
