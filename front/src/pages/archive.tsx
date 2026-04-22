import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import ArchivePage, { type ArchiveView } from "@/features/archive/components/archive-page";
import type { ArchiveSessionItem, FeedbackDocumentListItem, MyArchiveQuestionItem, MyArchiveReviewItem } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

function archiveViewFromSearchParam(value: string | null): ArchiveView {
  if (value === "reviews" || value === "questions" || value === "report") {
    return value;
  }

  return "sessions";
}

export default function ArchiveRoutePage() {
  const [searchParams] = useSearchParams();
  const initialView = archiveViewFromSearchParam(searchParams.get("view"));
  const state = useReadmatesData(
    useCallback(async () => {
      const [sessions, questions, reviews, reports] = await Promise.all([
        readmatesFetch<ArchiveSessionItem[]>("/api/archive/sessions"),
        readmatesFetch<MyArchiveQuestionItem[]>("/api/archive/me/questions"),
        readmatesFetch<MyArchiveReviewItem[]>("/api/archive/me/reviews"),
        readmatesFetch<FeedbackDocumentListItem[]>("/api/feedback-documents/me"),
      ]);

      return { sessions, questions, reviews, reports };
    }, []),
  );

  return (
    <ReadmatesPageState state={state}>
      {(data) => <ArchivePage {...data} initialView={initialView} />}
    </ReadmatesPageState>
  );
}
