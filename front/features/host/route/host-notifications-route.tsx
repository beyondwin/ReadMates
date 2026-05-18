import { useMemo, useState } from "react";
import { useLoaderData, useParams } from "react-router-dom";
import { useIsFetching, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { HostNotificationsPage } from "@/features/host/ui/host-notifications-page";
import type {
  HostNotificationDeliveryListResponse,
  HostNotificationEventListResponse,
  ManualNotificationOptionsResponse,
  NotificationTestMailAuditPage,
} from "@/features/host/api/host-contracts";
import {
  hostNotificationAuditQuery,
  hostNotificationDeliveriesQuery,
  hostNotificationEventsQuery,
  hostNotificationKeys,
  hostNotificationManualDispatchesQuery,
  hostNotificationManualOptionsQuery,
  hostNotificationSessionsQuery,
  hostNotificationSummaryQuery,
  useConfirmManualNotificationMutation,
  usePreviewManualNotificationMutation,
  useProcessHostNotificationsMutation,
  useRestoreHostNotificationMutation,
  useRetryHostNotificationMutation,
  useSendHostNotificationTestMailMutation,
  type ManualOptionsQueryRequest,
} from "@/features/host/queries/host-notification-queries";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import type { HostNotificationsRouteData } from "./host-notifications-data";

const HOST_NOTIFICATION_LEDGER_PAGE_LIMIT = 50;
const MANUAL_DISPATCH_PAGE_LIMIT = 20;
const MANUAL_MEMBER_PAGE_LIMIT = 50;

type PagedResponse<T> = {
  items: T[];
  nextCursor: string | null;
};

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext | undefined {
  return clubSlug ? { clubSlug } : undefined;
}

function firstPage(limit: number): PageRequest {
  return { limit };
}

function pageRequests(limit: number, cursors: string[]): PageRequest[] {
  return [firstPage(limit), ...cursors.map((cursor) => ({ limit, cursor }))];
}

function appendCursor(cursors: string[], cursor: string | null | undefined): string[] {
  if (!cursor || cursors.includes(cursor)) {
    return cursors;
  }
  return [...cursors, cursor];
}

function combinePages<T>(pages: Array<PagedResponse<T> | undefined>): PagedResponse<T> {
  const lastPage = [...pages].reverse().find(Boolean);
  return {
    items: pages.flatMap((page) => page?.items ?? []),
    nextCursor: lastPage?.nextCursor ?? null,
  };
}

function combineManualOptions(
  pages: Array<ManualNotificationOptionsResponse | undefined>,
): ManualNotificationOptionsResponse {
  const first = pages.find(Boolean);
  const last = [...pages].reverse().find(Boolean);
  if (!first) {
    return {
      session: null,
      templates: [],
      members: { items: [], nextCursor: null },
      recentDispatches: [],
    };
  }

  return {
    ...first,
    members: {
      items: pages.flatMap((page) => page?.members.items ?? []),
      nextCursor: last?.members.nextCursor ?? null,
    },
  };
}

export function HostNotificationsRoute() {
  const data = useLoaderData() as HostNotificationsRouteData;
  const params = useParams();
  const context = useMemo(() => contextFromClubSlug(params.clubSlug), [params.clubSlug]);
  const queryClient = useQueryClient();
  const [eventCursors, setEventCursors] = useState<string[]>([]);
  const [deliveryCursors, setDeliveryCursors] = useState<string[]>([]);
  const [auditCursors, setAuditCursors] = useState<string[]>([]);
  const [manualDispatchCursors, setManualDispatchCursors] = useState<string[]>([]);
  const [manualMemberCursors, setManualMemberCursors] = useState<string[]>([]);
  const [manualOptionsRequest, setManualOptionsRequest] = useState<ManualOptionsQueryRequest>(() => ({
    sessionId: data.initialManualSelection.sessionId,
    page: { limit: MANUAL_MEMBER_PAGE_LIMIT },
  }));

  const summaryQuery = useQuery(hostNotificationSummaryQuery(context));
  const sessionsQuery = useQuery(hostNotificationSessionsQuery(context));

  const eventPageRequests = pageRequests(HOST_NOTIFICATION_LEDGER_PAGE_LIMIT, eventCursors);
  const deliveryPageRequests = pageRequests(HOST_NOTIFICATION_LEDGER_PAGE_LIMIT, deliveryCursors);
  const auditPageRequests = pageRequests(HOST_NOTIFICATION_LEDGER_PAGE_LIMIT, auditCursors);
  const dispatchPageRequests = pageRequests(MANUAL_DISPATCH_PAGE_LIMIT, manualDispatchCursors);
  const manualOptionPageRequests = pageRequests(MANUAL_MEMBER_PAGE_LIMIT, manualMemberCursors);

  const eventQueries = useQueries({
    queries: eventPageRequests.map((page) => hostNotificationEventsQuery(page, context)),
  });
  const deliveryQueries = useQueries({
    queries: deliveryPageRequests.map((page) => hostNotificationDeliveriesQuery(page, context)),
  });
  const auditQueries = useQueries({
    queries: auditPageRequests.map((page) => hostNotificationAuditQuery(page, context)),
  });
  const manualDispatchQueries = useQueries({
    queries: dispatchPageRequests.map((page) => hostNotificationManualDispatchesQuery({ page }, context)),
  });
  const manualOptionsQueries = useQueries({
    queries: manualOptionPageRequests.map((page) =>
      hostNotificationManualOptionsQuery({ ...manualOptionsRequest, page }, context),
    ),
  });

  const events = combinePages<HostNotificationEventListResponse["items"][number]>(eventQueries.map((query) => query.data));
  const deliveries = combinePages<HostNotificationDeliveryListResponse["items"][number]>(deliveryQueries.map((query) => query.data));
  const audit = combinePages<NotificationTestMailAuditPage["items"][number]>(auditQueries.map((query) => query.data));
  const manualDispatches = combinePages(manualDispatchQueries.map((query) => query.data));
  const manualOptions = combineManualOptions(manualOptionsQueries.map((query) => query.data));

  const resetLedgerPages = () => {
    setEventCursors([]);
    setDeliveryCursors([]);
    setAuditCursors([]);
    setManualDispatchCursors([]);
  };

  const processMutation = useProcessHostNotificationsMutation(context);
  const retryMutation = useRetryHostNotificationMutation(context);
  const restoreMutation = useRestoreHostNotificationMutation(context);
  const testMailMutation = useSendHostNotificationTestMailMutation(context);
  const previewManualMutation = usePreviewManualNotificationMutation();
  const confirmManualMutation = useConfirmManualNotificationMutation(context);
  const isAnyQueryFetching =
    summaryQuery.isFetching ||
    sessionsQuery.isFetching ||
    eventQueries.some((query) => query.isFetching) ||
    deliveryQueries.some((query) => query.isFetching) ||
    auditQueries.some((query) => query.isFetching) ||
    manualDispatchQueries.some((query) => query.isFetching) ||
    manualOptionsQueries.some((query) => query.isFetching);
  const manualOptionsFetchingCount = useIsFetching({
    queryKey: hostNotificationKeys.manualOptionsRoot(context),
  });
  const manualPending =
    previewManualMutation.isPending ||
    confirmManualMutation.isPending ||
    manualOptionsFetchingCount > 0;

  const loadManualOptions = async (sessionId?: string, search?: string) => {
    const request = {
      sessionId: sessionId ?? null,
      search: search ?? null,
      page: { limit: MANUAL_MEMBER_PAGE_LIMIT },
    };
    const options = await queryClient.fetchQuery(hostNotificationManualOptionsQuery(request, context));
    setManualOptionsRequest(request);
    setManualMemberCursors([]);
    return options;
  };

  const loadMoreManualMembers = async (sessionId?: string, search?: string, cursor?: string) => {
    if (!cursor) {
      return manualOptions;
    }
    const request = {
      sessionId: sessionId ?? null,
      search: search ?? null,
      page: { limit: MANUAL_MEMBER_PAGE_LIMIT, cursor },
    };
    await queryClient.fetchQuery(hostNotificationManualOptionsQuery(request, context));
    setManualOptionsRequest((current) => ({
      ...current,
      sessionId: sessionId ?? current.sessionId ?? null,
      search: search ?? current.search ?? null,
    }));
    setManualMemberCursors((current) => appendCursor(current, cursor));
    return combineManualOptions([
      ...manualOptionsQueries.map((query) => query.data),
      queryClient.getQueryData(hostNotificationManualOptionsQuery(request, context).queryKey),
    ]);
  };

  return (
    <HostNotificationsPage
      summary={summaryQuery.data ?? { pending: 0, failed: 0, dead: 0, sentLast24h: 0, latestFailures: [] }}
      events={events.items}
      deliveries={deliveries.items}
      audit={audit.items}
      hostSessions={sessionsQuery.data?.items ?? []}
      manualOptions={manualOptions}
      manualDispatches={manualDispatches.items}
      initialManualSelection={data.initialManualSelection}
      hasMoreEvents={Boolean(events.nextCursor)}
      hasMoreDeliveries={Boolean(deliveries.nextCursor)}
      hasMoreAudit={Boolean(audit.nextCursor)}
      hasMoreManualDispatches={Boolean(manualDispatches.nextCursor)}
      isLoadingMoreEvents={eventQueries.some((query) => query.isFetching)}
      isLoadingMoreDeliveries={deliveryQueries.some((query) => query.isFetching)}
      isLoadingMoreAudit={auditQueries.some((query) => query.isFetching)}
      isLoadingMoreManualDispatches={manualDispatchQueries.some((query) => query.isFetching)}
      isRefreshing={isAnyQueryFetching}
      manualPending={manualPending}
      onLoadMoreEvents={async () => setEventCursors((current) => appendCursor(current, events.nextCursor))}
      onLoadMoreDeliveries={async () => setDeliveryCursors((current) => appendCursor(current, deliveries.nextCursor))}
      onLoadMoreAudit={async () => setAuditCursors((current) => appendCursor(current, audit.nextCursor))}
      onLoadMoreManualDispatches={async () => setManualDispatchCursors((current) => appendCursor(current, manualDispatches.nextCursor))}
      onProcess={async () => {
        await processMutation.mutateAsync();
        resetLedgerPages();
      }}
      onRetry={async (id) => {
        await retryMutation.mutateAsync(id);
        resetLedgerPages();
      }}
      onRestore={async (id) => {
        await restoreMutation.mutateAsync(id);
        resetLedgerPages();
      }}
      onSendTestMail={async (request) => {
        await testMailMutation.mutateAsync(request);
        resetLedgerPages();
      }}
      onPreviewManual={(request) => previewManualMutation.mutateAsync(request)}
      onConfirmManual={async (request) => {
        await confirmManualMutation.mutateAsync(request);
        resetLedgerPages();
      }}
      onLoadManualOptions={loadManualOptions}
      onLoadMoreManualMembers={loadMoreManualMembers}
    />
  );
}
