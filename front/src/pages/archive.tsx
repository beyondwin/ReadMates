import { useCallback } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import ArchivePage, { type ArchiveView } from "@/features/archive/components/archive-page";
import type { ArchiveSessionItem, FeedbackDocumentListItem, MyArchiveQuestionItem, MyArchiveReviewItem } from "@/shared/api/readmates";
import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

function archiveViewFromSearchParam(value: string | null): ArchiveView {
  if (value === "reviews" || value === "questions" || value === "report") {
    return value;
  }

  return "sessions";
}

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

export default function ArchiveRoutePage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = archiveViewFromSearchParam(searchParams.get("view"));
  const handleViewChange = useCallback(
    (view: ArchiveView) => {
      setSearchParams({ view }, { replace: true });
    },
    [setSearchParams],
  );
  const state = useReadmatesData(
    useCallback(async () => {
      const [sessions, questions, reviews, reports] = await Promise.all([
        readmatesFetch<ArchiveSessionItem[]>("/api/archive/sessions"),
        readmatesFetch<MyArchiveQuestionItem[]>("/api/archive/me/questions"),
        readmatesFetch<MyArchiveReviewItem[]>("/api/archive/me/reviews"),
        loadMyFeedbackDocuments(),
      ]);

      return { sessions, questions, reviews, reports };
    }, []),
  );

  return (
    <ReadmatesPageState state={state}>
      {(data) => (
        <ArchivePage
          {...data}
          initialView={initialView}
          onViewChange={handleViewChange}
          routePathname={location.pathname}
          routeSearch={location.search}
        />
      )}
    </ReadmatesPageState>
  );
}
