import { useCallback, useState } from "react";
import { useLoaderData, useParams, useSearchParams } from "react-router-dom";
import { fetchNotesFeed, fetchNoteSessions } from "@/features/archive/api/archive-api";
import type { NotesFeedRouteData } from "@/features/archive/route/notes-feed-data";
import { feedFilterFromSearchParam, type FeedFilter } from "@/features/archive/model/notes-feed-model";
import NotesFeedPage from "@/features/archive/ui/notes-feed-page";

const NOTES_SESSIONS_NEXT_PAGE_LIMIT = 30;
const NOTES_FEED_NEXT_PAGE_LIMIT = 60;

export function NotesFeedRoute() {
  const data = useLoaderData() as NotesFeedRouteData;
  const [pageState, setPageState] = useState({ source: data, pages: data });
  const pages = pageState.source === data ? pageState.pages : data;
  const { clubSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = feedFilterFromSearchParam(searchParams.get("filter"));

  const handleFilterChange = useCallback(
    (filter: FeedFilter) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);

          if (filter === "all") {
            next.delete("filter");
          } else {
            next.set("filter", filter);
          }

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const loadMoreNoteSessions = useCallback(async () => {
    const cursor = pages.noteSessions.nextCursor;

    if (!cursor) {
      return;
    }

    const nextPage = await fetchNoteSessions(clubSlug ? { clubSlug } : undefined, { limit: NOTES_SESSIONS_NEXT_PAGE_LIMIT, cursor });
    setPageState((current) => {
      const currentPages = current.source === data ? current.pages : data;

      return {
        source: data,
        pages: {
          ...currentPages,
          noteSessions: {
            items: [...currentPages.noteSessions.items, ...nextPage.items],
            nextCursor: nextPage.nextCursor,
          },
        },
      };
    });
  }, [clubSlug, data, pages.noteSessions.nextCursor]);
  const loadMoreItems = useCallback(async () => {
    const cursor = pages.items.nextCursor;
    const sessionId = pages.selectedSession?.sessionId;

    if (!cursor || !sessionId) {
      return;
    }

    const nextPage = await fetchNotesFeed(sessionId, clubSlug ? { clubSlug } : undefined, { limit: NOTES_FEED_NEXT_PAGE_LIMIT, cursor });
    setPageState((current) => {
      const currentPages = current.source === data ? current.pages : data;

      return {
        source: data,
        pages: {
          ...currentPages,
          items: {
            items: [...currentPages.items.items, ...nextPage.items],
            nextCursor: nextPage.nextCursor,
          },
        },
      };
    });
  }, [clubSlug, data, pages.items.nextCursor, pages.selectedSession?.sessionId]);

  return (
    <NotesFeedPage
      items={pages.items}
      noteSessions={pages.noteSessions}
      selectedSessionId={pages.selectedSession?.sessionId ?? null}
      selectedSession={pages.selectedSession}
      initialFilter={initialFilter}
      onFilterChange={handleFilterChange}
      onLoadMoreItems={loadMoreItems}
      onLoadMoreNoteSessions={loadMoreNoteSessions}
    />
  );
}
