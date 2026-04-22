import { useCallback } from "react";
import MyPage from "@/features/archive/components/my-page";
import type { FeedbackDocumentListItem, MyArchiveQuestionItem, MyArchiveReviewItem, MyPageResponse } from "@/shared/api/readmates";
import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

async function loadMyFeedbackDocuments(): Promise<FeedbackDocumentListItem[]> {
  const response = await readmatesFetchResponse("/api/feedback-documents/me");

  if (response.status === 403) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`ReadMates feedback documents fetch failed: ${response.status}`);
  }

  return response.json() as Promise<FeedbackDocumentListItem[]>;
}

export default function MyRoutePage() {
  const state = useReadmatesData(
    useCallback(async () => {
      const [data, reports, questions, reviews] = await Promise.all([
        readmatesFetch<MyPageResponse>("/api/app/me"),
        loadMyFeedbackDocuments(),
        readmatesFetch<MyArchiveQuestionItem[]>("/api/archive/me/questions"),
        readmatesFetch<MyArchiveReviewItem[]>("/api/archive/me/reviews"),
      ]);

      return { data, reports, questionCount: questions.length, reviewCount: reviews.length };
    }, []),
  );

  return <ReadmatesPageState state={state}>{(data) => <MyPage {...data} />}</ReadmatesPageState>;
}
