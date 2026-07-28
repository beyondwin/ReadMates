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
  scope: string | null;
  page: MyJourneyPage;
  pendingCursor: string | null;
  failedCursor: string | null;
};

type MyRecordsRequestToken = {
  source: MyJourneyPage;
  scope: string | null;
  cursor: string;
};

function initialPaginationState(source: MyJourneyPage, scope: string | null): MyRecordsPaginationState {
  return { source, scope, page: source, pendingCursor: null, failedCursor: null };
}

function matchesRequestScope(
  state: MyRecordsPaginationState,
  token: MyRecordsRequestToken,
) {
  return state.source === token.source && state.scope === token.scope;
}

export function MyRecordsRoute() {
  const loaderPage = useLoaderData() as MyJourneyPage;
  const { clubSlug } = useParams();
  const scope = clubSlug ?? null;
  const pendingRequestRef = useRef<MyRecordsRequestToken | null>(null);
  const [state, setState] = useState(() => initialPaginationState(loaderPage, scope));

  if (state.source !== loaderPage || state.scope !== scope) {
    setState(initialPaginationState(loaderPage, scope));
  }

  const stateMatchesLoader = state.source === loaderPage && state.scope === scope;
  const page = stateMatchesLoader ? state.page : loaderPage;
  const pendingCursor = stateMatchesLoader ? state.pendingCursor : null;
  const failedCursor = stateMatchesLoader ? state.failedCursor : null;

  const loadMore = async () => {
    const cursor = failedCursor ?? page.nextCursor;

    if (!cursor || pendingRequestRef.current !== null) {
      return;
    }

    const requestToken = { source: loaderPage, scope, cursor };
    pendingRequestRef.current = requestToken;
    setState((current) => (
      matchesRequestScope(current, requestToken)
        ? { ...current, pendingCursor: cursor, failedCursor: null }
        : current
    ));

    try {
      const nextPage = await fetchMyJourney(
        scope ? { clubSlug: scope } : undefined,
        { limit: 12, cursor },
      );

      setState((current) => {
        if (!matchesRequestScope(current, requestToken)) {
          return current;
        }

        return {
          source: requestToken.source,
          scope: requestToken.scope,
          page: {
            ...current.page,
            items: appendUniqueJourneyItems(current.page.items, nextPage.items),
            nextCursor: nextPage.nextCursor,
          },
          pendingCursor: null,
          failedCursor: null,
        };
      });
    } catch {
      setState((current) => (
        matchesRequestScope(current, requestToken)
          ? { ...current, pendingCursor: null, failedCursor: cursor }
          : current
      ));
    } finally {
      if (pendingRequestRef.current === requestToken) {
        pendingRequestRef.current = null;
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
