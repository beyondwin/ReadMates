import { useCallback, useState } from "react";
import { useLoaderData, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  fetchArchiveSessions,
  fetchMyArchiveQuestions,
  fetchMyArchiveReviews,
  fetchMyFeedbackDocuments,
} from "@/features/archive/api/archive-api";
import { archiveViewFromSearchParam, type ArchiveView } from "@/features/archive/model/archive-model";
import type { ArchiveListRouteData } from "@/features/archive/route/archive-list-data";
import ArchivePage from "@/features/archive/ui/archive-page";

const ARCHIVE_NEXT_PAGE_LIMIT = 30;

export function ArchiveListRoute({ reviewAuthorName = null }: { reviewAuthorName?: string | null }) {
  const data = useLoaderData() as ArchiveListRouteData;
  const [pageState, setPageState] = useState({ source: data, pages: data });
  const pages = pageState.source === data ? pageState.pages : data;
  const location = useLocation();
  const { clubSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = archiveViewFromSearchParam(searchParams.get("view"));

  const handleViewChange = useCallback(
    (view: ArchiveView) => {
      setSearchParams({ view }, { replace: true });
    },
    [setSearchParams],
  );
  const loadMoreSessions = useCallback(async () => {
    const cursor = pages.sessions.nextCursor;

    if (!cursor) {
      return;
    }

    const nextPage = await fetchArchiveSessions(clubSlug ? { clubSlug } : undefined, { limit: ARCHIVE_NEXT_PAGE_LIMIT, cursor });
    setPageState((current) => {
      const currentPages = current.source === data ? current.pages : data;

      return {
        source: data,
        pages: {
          ...currentPages,
          sessions: {
            items: [...currentPages.sessions.items, ...nextPage.items],
            nextCursor: nextPage.nextCursor,
          },
        },
      };
    });
  }, [clubSlug, data, pages.sessions.nextCursor]);
  const loadMoreQuestions = useCallback(async () => {
    const cursor = pages.questions.nextCursor;

    if (!cursor) {
      return;
    }

    const nextPage = await fetchMyArchiveQuestions(clubSlug ? { clubSlug } : undefined, { limit: ARCHIVE_NEXT_PAGE_LIMIT, cursor });
    setPageState((current) => {
      const currentPages = current.source === data ? current.pages : data;

      return {
        source: data,
        pages: {
          ...currentPages,
          questions: {
            items: [...currentPages.questions.items, ...nextPage.items],
            nextCursor: nextPage.nextCursor,
          },
        },
      };
    });
  }, [clubSlug, data, pages.questions.nextCursor]);
  const loadMoreReviews = useCallback(async () => {
    const cursor = pages.reviews.nextCursor;

    if (!cursor) {
      return;
    }

    const nextPage = await fetchMyArchiveReviews(clubSlug ? { clubSlug } : undefined, { limit: ARCHIVE_NEXT_PAGE_LIMIT, cursor });
    setPageState((current) => {
      const currentPages = current.source === data ? current.pages : data;

      return {
        source: data,
        pages: {
          ...currentPages,
          reviews: {
            items: [...currentPages.reviews.items, ...nextPage.items],
            nextCursor: nextPage.nextCursor,
          },
        },
      };
    });
  }, [clubSlug, data, pages.reviews.nextCursor]);
  const loadMoreReports = useCallback(async () => {
    const cursor = pages.reports.nextCursor;

    if (!cursor) {
      return;
    }

    const nextPage = await fetchMyFeedbackDocuments(clubSlug ? { clubSlug } : undefined, { limit: ARCHIVE_NEXT_PAGE_LIMIT, cursor });
    setPageState((current) => {
      const currentPages = current.source === data ? current.pages : data;

      return {
        source: data,
        pages: {
          ...currentPages,
          reports: {
            items: [...currentPages.reports.items, ...nextPage.items],
            nextCursor: nextPage.nextCursor,
          },
        },
      };
    });
  }, [clubSlug, data, pages.reports.nextCursor]);

  return (
    <ArchivePage
      {...pages}
      initialView={initialView}
      onViewChange={handleViewChange}
      routePathname={location.pathname}
      routeSearch={location.search}
      reviewAuthorName={reviewAuthorName}
      onLoadMoreSessions={loadMoreSessions}
      onLoadMoreQuestions={loadMoreQuestions}
      onLoadMoreReviews={loadMoreReviews}
      onLoadMoreReports={loadMoreReports}
    />
  );
}
