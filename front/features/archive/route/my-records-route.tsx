import { useRef, useState } from "react";
import { useLoaderData, useParams } from "react-router-dom";
import { fetchMyJourney } from "@/features/archive/api/archive-api";
import {
  appendUniqueJourneyItems,
  type MyJourneyPage,
} from "@/features/archive/model/my-reading-shelf-model";
import { MyRecordsPage } from "@/features/archive/ui/my-records-page";

type MyRecordsPaginationState = {
  source: MyJourneyPage;
  page: MyJourneyPage;
  pendingCursor: string | null;
  failedCursor: string | null;
};

function initialPaginationState(source: MyJourneyPage): MyRecordsPaginationState {
  return { source, page: source, pendingCursor: null, failedCursor: null };
}

export function MyRecordsRoute() {
  const loaderPage = useLoaderData() as MyJourneyPage;
  const { clubSlug } = useParams();
  const pendingCursorRef = useRef<string | null>(null);
  const [state, setState] = useState(() => initialPaginationState(loaderPage));

  if (state.source !== loaderPage) {
    setState(initialPaginationState(loaderPage));
  }

  const page = state.source === loaderPage ? state.page : loaderPage;
  const pendingCursor = state.source === loaderPage ? state.pendingCursor : null;
  const failedCursor = state.source === loaderPage ? state.failedCursor : null;

  const loadMore = async () => {
    const cursor = failedCursor ?? page.nextCursor;

    if (!cursor || pendingCursorRef.current === cursor) {
      return;
    }

    pendingCursorRef.current = cursor;
    setState((current) => ({
      ...current,
      pendingCursor: cursor,
      failedCursor: null,
    }));

    try {
      const nextPage = await fetchMyJourney(
        clubSlug ? { clubSlug } : undefined,
        { limit: 12, cursor },
      );

      setState((current) => ({
        source: loaderPage,
        page: {
          ...current.page,
          items: appendUniqueJourneyItems(current.page.items, nextPage.items),
          nextCursor: nextPage.nextCursor,
        },
        pendingCursor: null,
        failedCursor: null,
      }));
    } catch {
      setState((current) => ({
        ...current,
        pendingCursor: null,
        failedCursor: cursor,
      }));
    } finally {
      if (pendingCursorRef.current === cursor) {
        pendingCursorRef.current = null;
      }
    }
  };

  return (
    <MyRecordsPage
      items={page.items}
      hasMore={Boolean(page.nextCursor)}
      loadMorePending={pendingCursor !== null}
      loadMoreError={failedCursor !== null}
      onLoadMore={loadMore}
      onRetryLoadMore={loadMore}
    />
  );
}
