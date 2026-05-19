import { useCallback, useMemo } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { archiveViewFromSearchParam, type ArchiveView } from "@/features/archive/model/archive-model";
import {
  ARCHIVE_NEXT_PAGE_LIMIT,
  archiveListQuery,
  combineArchiveListPages,
} from "@/features/archive/queries/archive-queries";
import ArchivePage from "@/features/archive/ui/archive-page";

export function ArchiveListRoute({ reviewAuthorName = null }: { reviewAuthorName?: string | null }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { clubSlug } = useParams();
  const context = useMemo(() => ({ clubSlug }), [clubSlug]);
  const archiveQuery = useQuery(archiveListQuery(context));
  const pages = archiveQuery.data;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = archiveViewFromSearchParam(searchParams.get("view"));

  const handleViewChange = useCallback(
    (view: ArchiveView) => {
      setSearchParams({ view }, { replace: true });
    },
    [setSearchParams],
  );
  const loadNext = useCallback(
    async (surface: "sessions" | "questions" | "reviews" | "reports") => {
      if (!pages) {
        return;
      }

      const cursor = pages[surface].nextCursor;

      if (!cursor) {
        return;
      }

      const nextPage = await queryClient.fetchQuery(
        archiveListQuery(context, { limit: ARCHIVE_NEXT_PAGE_LIMIT, cursor }),
      );
      queryClient.setQueryData(archiveListQuery(context).queryKey, combineArchiveListPages([pages, nextPage]));
    },
    [context, pages, queryClient],
  );

  if (!pages) {
    return null;
  }

  return (
    <ArchivePage
      {...pages}
      initialView={initialView}
      onViewChange={handleViewChange}
      routePathname={location.pathname}
      routeSearch={location.search}
      reviewAuthorName={reviewAuthorName}
      onLoadMoreSessions={() => loadNext("sessions")}
      onLoadMoreQuestions={() => loadNext("questions")}
      onLoadMoreReviews={() => loadNext("reviews")}
      onLoadMoreReports={() => loadNext("reports")}
    />
  );
}
