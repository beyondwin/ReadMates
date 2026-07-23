import { useMemo, useState } from "react";
import { useLoaderData, useParams } from "react-router-dom";
import { useIsFetching, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { HostNotificationsPage } from "@/features/host/ui/host-notifications-page";
import type {
  HostNotificationDeliveryListResponse,
  HostNotificationEventListResponse,
  NotificationTestMailAuditPage,
} from "@/features/host/api/host-contracts";
import {
  hostNotificationAuditQuery,
  hostNotificationDeliveriesQuery,
  hostNotificationEventsQuery,
  hostNotificationKeys,
  hostNotificationManualDispatchesQuery,
  hostNotificationManualOptionsQuery,
  hostNotificationPolicyQuery,
  hostNotificationSessionsQuery,
  hostNotificationSummaryQuery,
  useConfirmManualNotificationMutation,
  usePreviewManualNotificationMutation,
  useProcessHostNotificationsMutation,
  useRestoreHostNotificationMutation,
  useRetryHostNotificationMutation,
  useSendHostNotificationTestMailMutation,
  useUpdateHostNotificationPolicyMutation,
  type ManualOptionsQueryRequest,
} from "@/features/host/queries/host-notification-queries";
import type { ReadmatesApiContext } from "@/shared/api/client";
import {
  appendCursor,
  combineCursorPages,
  pageRequests,
} from "@/shared/query/cursor-pagination";
import type { HostNotificationsRouteData } from "./host-notifications-data";
import { combineManualOptions } from "./host-notifications-route-model";

const HOST_NOTIFICATION_LEDGER_PAGE_LIMIT = 50;
const MANUAL_DISPATCH_PAGE_LIMIT = 20;
const MANUAL_MEMBER_PAGE_LIMIT = 50;

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext | undefined {
  return clubSlug ? { clubSlug } : undefined;
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
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [manualOptionsRequest, setManualOptionsRequest] = useState<ManualOptionsQueryRequest>(() => ({
    sessionId: data.initialManualSelection.sessionId,
    page: { limit: MANUAL_MEMBER_PAGE_LIMIT },
  }));

  const summaryQuery = useQuery(hostNotificationSummaryQuery(context));
  const sessionsQuery = useQuery(hostNotificationSessionsQuery(context));
  const policyQuery = useQuery(hostNotificationPolicyQuery(context));

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

  const events = combineCursorPages<HostNotificationEventListResponse["items"][number]>(eventQueries.map((query) => query.data));
  const deliveries = combineCursorPages<HostNotificationDeliveryListResponse["items"][number]>(deliveryQueries.map((query) => query.data));
  const audit = combineCursorPages<NotificationTestMailAuditPage["items"][number]>(auditQueries.map((query) => query.data));
  const manualDispatches = combineCursorPages(manualDispatchQueries.map((query) => query.data));
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
  const updatePolicyMutation = useUpdateHostNotificationPolicyMutation(context);
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
      policy={policyQuery.data}
      policyPending={updatePolicyMutation.isPending}
      policyError={policyError}
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
      onPolicyChange={async (enabled) => {
        setPolicyError(null);
        try {
          await updatePolicyMutation.mutateAsync({ sessionReminderEnabled: enabled });
        } catch {
          setPolicyError("리마인더 정책을 저장하지 못했습니다. 다시 시도해 주세요.");
        }
      }}
    />
  );
}
