import { useCallback } from "react";
import MyPage from "@/features/archive/components/my-page";
import type { FeedbackDocumentListItem, MyArchiveQuestionItem, MyArchiveReviewItem, MyPageResponse } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

export default function MyRoutePage() {
  const state = useReadmatesData(
    useCallback(async () => {
      const [data, reports, questions, reviews] = await Promise.all([
        readmatesFetch<MyPageResponse>("/api/app/me"),
        readmatesFetch<FeedbackDocumentListItem[]>("/api/feedback-documents/me"),
        readmatesFetch<MyArchiveQuestionItem[]>("/api/archive/me/questions"),
        readmatesFetch<MyArchiveReviewItem[]>("/api/archive/me/reviews"),
      ]);

      return { data, reports, questionCount: questions.length, reviewCount: reviews.length };
    }, []),
  );

  return <ReadmatesPageState state={state}>{(data) => <MyPage {...data} />}</ReadmatesPageState>;
}
