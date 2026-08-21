import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLoaderData, useParams } from "react-router";
import { hostClubOperationsQuery } from "@/features/host/queries/host-club-operations-queries";
import { hostNotificationHealthQuery } from "@/features/host/queries/host-notification-queries";
import { hostSessionRecordAttentionPagesQuery } from "@/features/host/queries/host-session-record-queries";
import type { HostLinkComponent } from "@/features/host/ui/host-link-types";
import { HostOperationsPage } from "@/features/host/ui/host-operations-page";
import type { HostOperationsRouteData } from "./host-operations-data";

export function HostOperationsRoute({
  LinkComponent,
}: {
  LinkComponent?: HostLinkComponent;
}) {
  const { auth, clubSlug } = useLoaderData() as HostOperationsRouteData;
  const params = useParams<{ clubSlug: string }>();
  const resolvedSlug = clubSlug ?? params.clubSlug ?? auth.currentMembership?.clubSlug;
  const context = useMemo(() => ({ clubSlug: resolvedSlug }), [resolvedSlug]);

  const attentionQuery = useInfiniteQuery(hostSessionRecordAttentionPagesQuery(context));
  const clubOpsQuery = useQuery(hostClubOperationsQuery(context));
  const notificationsQuery = useQuery(hostNotificationHealthQuery(context));

  const attentionItems = attentionQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const totalCount = attentionQuery.data?.pages[0]?.summary.needsAttentionCount ?? 0;

  return (
    <HostOperationsPage
      clubSlug={resolvedSlug ?? ""}
      LinkComponent={LinkComponent}
      attention={{
        items: attentionItems,
        totalCount,
        hasMore: Boolean(attentionQuery.hasNextPage),
        loading: attentionQuery.isPending && !attentionQuery.data,
        loadingMore: attentionQuery.isFetchingNextPage,
        error: attentionQuery.isError && !attentionQuery.data
          ? "확인 필요 목록을 불러오지 못했습니다."
          : null,
        loadMoreError: attentionQuery.isFetchNextPageError ? "더 불러오지 못했습니다." : null,
        isRefreshing: attentionQuery.isFetching && !attentionQuery.isPending && !attentionQuery.isFetchingNextPage,
        onRetry: () => {
          void attentionQuery.refetch();
        },
        onLoadMore: () => {
          void attentionQuery.fetchNextPage();
        },
      }}
      clubReadiness={{
        data: clubOpsQuery.data ?? null,
        loading: clubOpsQuery.isPending && !clubOpsQuery.data,
        error: clubOpsQuery.isError
          ? clubOpsQuery.data
            ? "클럽 준비도를 새로고치지 못했습니다."
            : "클럽 준비도를 불러오지 못했습니다."
          : null,
        isRefreshing: clubOpsQuery.isFetching && Boolean(clubOpsQuery.data),
        onRetry: () => {
          void clubOpsQuery.refetch();
        },
      }}
      notifications={{
        data: notificationsQuery.data ?? null,
        loading: notificationsQuery.isPending && !notificationsQuery.data,
        error: notificationsQuery.isError
          ? notificationsQuery.data
            ? "알림 상태를 새로고치지 못했습니다."
            : "알림 상태를 불러오지 못했습니다."
          : null,
        isRefreshing: notificationsQuery.isFetching && Boolean(notificationsQuery.data),
        onRetry: () => {
          void notificationsQuery.refetch();
        },
      }}
    />
  );
}
