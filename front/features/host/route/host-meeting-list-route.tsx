import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useLocation, useNavigate, useParams } from "react-router";
import { isReadmatesApiError } from "@/shared/api/errors";
import {
  hostListCursorRecovery,
  hostMeetingListBaseRefresh,
  hostMeetingListNextCursor,
  hostMeetingListRows,
  type HostMeetingListState,
} from "@/features/host/model/host-meeting-list-model";
import {
  HostMeetingList,
} from "@/features/host/ui/meeting-list/host-meeting-list";
import type { HostSessionLedgerLinkComponent } from "@/features/host/ui/host-session-ledger";
import { HostSessionLedgerRoute } from "./host-session-ledger-route";
import {
  HOST_MEETING_LIST_PAGE_LIMIT,
  hostMeetingListPageQuery,
  type HostMeetingListRouteData,
} from "./host-meeting-list-data";

export function HostMeetingListRoute({
  LinkComponent,
}: {
  LinkComponent?: HostSessionLedgerLinkComponent;
}) {
  const loaderData = useLoaderData() as HostMeetingListRouteData;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => ({ clubSlug }), [clubSlug]);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (loaderData.view === "trash") {
    return <HostSessionLedgerRoute LinkComponent={LinkComponent} />;
  }

  return (
    <MeetingListBody
      loaderData={loaderData}
      context={context}
      canonicalHref={location.pathname}
      navigate={navigate}
      queryClient={queryClient}
      LinkComponent={LinkComponent}
    />
  );
}

function MeetingListBody({
  loaderData,
  context,
  canonicalHref,
  navigate,
  queryClient,
  LinkComponent,
}: {
  loaderData: Extract<HostMeetingListRouteData, { view: "meeting" }>;
  context: { clubSlug?: string };
  canonicalHref: string;
  navigate: ReturnType<typeof useNavigate>;
  queryClient: ReturnType<typeof useQueryClient>;
  LinkComponent?: HostSessionLedgerLinkComponent;
}) {
  const firstRequest = useMemo(() => ({ limit: HOST_MEETING_LIST_PAGE_LIMIT }), []);
  const query = useQuery({
    ...hostMeetingListPageQuery(firstRequest, context),
    initialData: loaderData.page ?? undefined,
  });
  const [state, setState] = useState<HostMeetingListState>({
    baseUpdatedAt: query.dataUpdatedAt,
    appendedItems: [],
    nextCursor: loaderData.page?.nextCursor ?? null,
    paginationStarted: false,
    announcement: null,
    focusHeadingRevision: 0,
    replaceHref: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const basePage = query.data ?? loaderData.page;
  const visibleState = state.baseUpdatedAt === query.dataUpdatedAt || !basePage
    ? state
    : hostMeetingListBaseRefresh(state, query.dataUpdatedAt, basePage.nextCursor);
  const nextCursor = hostMeetingListNextCursor(visibleState, basePage?.nextCursor ?? null);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = await queryClient.fetchQuery(
        hostMeetingListPageQuery({ limit: HOST_MEETING_LIST_PAGE_LIMIT, cursor: nextCursor }, context),
      );
      setState((current) => {
        const currentBase = current.baseUpdatedAt === query.dataUpdatedAt
          ? current
          : hostMeetingListBaseRefresh(current, query.dataUpdatedAt, basePage?.nextCursor ?? null);
        return {
          ...currentBase,
          appendedItems: [...currentBase.appendedItems, ...nextPage.items],
          nextCursor: nextPage.nextCursor,
          paginationStarted: true,
          announcement: null,
          replaceHref: null,
        };
      });
    } catch (error) {
      if (isReadmatesApiError(error) && error.code === "LIST_CURSOR_STALE") {
        setState((current) => hostListCursorRecovery(current, canonicalHref));
        await navigate(canonicalHref, { replace: true });
        await query.refetch();
      } else {
        setState((current) => ({ ...current, announcement: "다음 모임을 불러오지 못했습니다." }));
      }
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <HostMeetingList
      rows={hostMeetingListRows([...(basePage?.items ?? []), ...visibleState.appendedItems])}
      nextCursor={nextCursor}
      loadingMore={loadingMore}
      onLoadMore={() => void loadMore()}
      LinkComponent={LinkComponent}
      announcement={visibleState.announcement}
      focusHeadingRevision={visibleState.focusHeadingRevision}
      loading={query.isPending && !basePage}
      errorMessage={query.isError && !basePage ? "모임을 불러오지 못했습니다." : null}
      onRetry={() => void query.refetch()}
    />
  );
}
