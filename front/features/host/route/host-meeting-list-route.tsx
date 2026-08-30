import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useLocation, useNavigate, useParams } from "react-router";
import { isReadmatesApiError } from "@/shared/api/errors";
import {
  buildHostMeetingTocSections,
  hostListCursorRecovery,
  hostMeetingListBaseRefresh,
  hostMeetingListNextCursor,
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
import { hostSessionRecordLedgerQuery } from "@/features/host/queries/host-session-record-queries";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import { HOST_ROUTE_HREFS } from "@/shared/routing/host-route-destinations";
import "@/features/host/ui/host-editorial-ledger.css";

const PAST_FIRST_REQUEST = { page: { limit: HOST_MEETING_LIST_PAGE_LIMIT } } as const;

export function HostMeetingListRoute({
  LinkComponent,
  detailLinkState,
}: {
  LinkComponent?: HostSessionLedgerLinkComponent;
  detailLinkState?: unknown;
}) {
  const loaderData = useLoaderData() as HostMeetingListRouteData;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => requireHostClubContext(clubSlug), [clubSlug]);
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
      detailLinkState={detailLinkState}
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
  detailLinkState,
}: {
  loaderData: Extract<HostMeetingListRouteData, { view: "meeting" }>;
  context: ExplicitReadmatesApiContext;
  canonicalHref: string;
  navigate: ReturnType<typeof useNavigate>;
  queryClient: ReturnType<typeof useQueryClient>;
  LinkComponent?: HostSessionLedgerLinkComponent;
  detailLinkState?: unknown;
}) {
  const firstRequest = useMemo(() => ({ limit: HOST_MEETING_LIST_PAGE_LIMIT }), []);
  const query = useQuery({
    ...hostMeetingListPageQuery(firstRequest, context),
    initialData: loaderData.page ?? undefined,
  });
  const pastQuery = useQuery({
    ...hostSessionRecordLedgerQuery(PAST_FIRST_REQUEST, context),
    initialData: loaderData.pastPage ?? undefined,
    retry: false,
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
  const [pastState, setPastState] = useState<HostMeetingListState>({
    baseUpdatedAt: pastQuery.dataUpdatedAt,
    appendedItems: [],
    nextCursor: loaderData.pastPage?.nextCursor ?? null,
    paginationStarted: false,
    announcement: null,
    focusHeadingRevision: 0,
    replaceHref: null,
  });
  const [loadingMoreUpcoming, setLoadingMoreUpcoming] = useState(false);
  const [loadingMorePast, setLoadingMorePast] = useState(false);

  const basePage = query.data ?? loaderData.page;
  const visibleState = state.baseUpdatedAt === query.dataUpdatedAt || !basePage
    ? state
    : hostMeetingListBaseRefresh(state, query.dataUpdatedAt, basePage.nextCursor);
  const nextCursor = hostMeetingListNextCursor(visibleState, basePage?.nextCursor ?? null);

  const basePastPage = pastQuery.data ?? loaderData.pastPage;
  const visiblePastState = pastState.baseUpdatedAt === pastQuery.dataUpdatedAt || !basePastPage
    ? pastState
    : hostMeetingListBaseRefresh(pastState, pastQuery.dataUpdatedAt, basePastPage.nextCursor);
  const pastNextCursor = hostMeetingListNextCursor(
    visiblePastState,
    basePastPage?.nextCursor ?? null,
  );

  const pastUnavailable = !basePastPage && (
    pastQuery.isError
    || (loaderData.pastPage === null && !pastQuery.isPending && !pastQuery.isFetching)
  );

  const loadMoreUpcoming = async () => {
    if (!nextCursor || loadingMoreUpcoming) return;
    setLoadingMoreUpcoming(true);
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
      setLoadingMoreUpcoming(false);
    }
  };

  const loadMorePast = async () => {
    if (!pastNextCursor || loadingMorePast || !basePastPage) return;
    setLoadingMorePast(true);
    try {
      const nextPage = await queryClient.fetchQuery(
        hostSessionRecordLedgerQuery({
          page: { limit: HOST_MEETING_LIST_PAGE_LIMIT, cursor: pastNextCursor },
        }, context),
      );
      setPastState((current) => {
        const currentBase = current.baseUpdatedAt === pastQuery.dataUpdatedAt
          ? current
          : hostMeetingListBaseRefresh(current, pastQuery.dataUpdatedAt, basePastPage.nextCursor);
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
        setPastState((current) => hostListCursorRecovery(current, canonicalHref));
        await navigate(canonicalHref, { replace: true });
        await pastQuery.refetch();
      } else {
        setPastState((current) => ({ ...current, announcement: "지난 모임을 더 불러오지 못했습니다." }));
      }
    } finally {
      setLoadingMorePast(false);
    }
  };

  const announcement = visibleState.announcement ?? visiblePastState.announcement;
  const focusHeadingRevision = Math.max(
    visibleState.focusHeadingRevision,
    visiblePastState.focusHeadingRevision,
  );

  const sections = buildHostMeetingTocSections({
    basePath: "/app/host",
    upcomingItems: [...(basePage?.items ?? []), ...visibleState.appendedItems],
    upcomingCursor: nextCursor,
    pastItems: pastUnavailable
      ? []
      : [...(basePastPage?.items ?? []), ...visiblePastState.appendedItems],
    pastCursor: pastUnavailable ? null : pastNextCursor,
    detailLinkState,
  });

  return (
    <HostMeetingList
      sections={sections}
      onLoadMoreUpcoming={() => void loadMoreUpcoming()}
      onLoadMorePast={() => void loadMorePast()}
      loadingMoreUpcoming={loadingMoreUpcoming}
      loadingMorePast={loadingMorePast}
      trashHref={HOST_ROUTE_HREFS.trashCompatibility}
      newMeetingHref={HOST_ROUTE_HREFS.newSession}
      LinkComponent={LinkComponent}
      announcement={announcement}
      focusHeadingRevision={focusHeadingRevision}
      loading={query.isPending && !basePage}
      errorMessage={query.isError && !basePage ? "모임을 불러오지 못했습니다." : null}
      onRetry={() => void query.refetch()}
      pastErrorMessage={pastUnavailable ? "지난 모임을 불러오지 못했습니다." : null}
      onRetryPast={() => void pastQuery.refetch()}
    />
  );
}
