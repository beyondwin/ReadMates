import { readmatesFetchResponse, type ReadmatesApiContext } from "@/shared/api/client";
import type {
  FeedbackDocumentListPage,
  FeedbackDocumentResponse,
} from "@/features/feedback/api/feedback-contracts";
import { pagingSearchParams, type PageRequest } from "@/shared/model/paging";

export type FeedbackLoadResult =
  | { status: "ready"; document: FeedbackDocumentResponse }
  | { status: "unavailable"; reason: "forbidden" | "missing" };

export async function fetchFeedbackDocumentList(context?: ReadmatesApiContext, page?: PageRequest): Promise<FeedbackDocumentListPage> {
  const response = await readmatesFetchResponse(`/api/feedback-documents/me${pagingSearchParams(page)}`, undefined, context);

  if (response.status === 403) {
    return { items: [], nextCursor: null };
  }

  if (!response.ok) {
    throw new Error(`ReadMates feedback document list fetch failed: ${response.status}`);
  }

  return response.json() as Promise<FeedbackDocumentListPage>;
}

export async function fetchFeedbackDocument(sessionId: string, context?: ReadmatesApiContext): Promise<FeedbackLoadResult> {
  const response = await readmatesFetchResponse(
    `/api/sessions/${encodeURIComponent(sessionId)}/feedback-document`,
    undefined,
    context,
  );

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
