import { useMemo, useState } from "react";
import { useLoaderData, useParams } from "react-router";
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
  invalidateHostNotificationOverview,
  publishHostNotificationPolicy,
  publishHostNotificationPolicyFailure,
  publishManualNotificationConfirm,
  useConfirmManualNotificationMutation,
  usePreviewManualNotificationMutation,
  useProcessHostNotificationsMutation,
  useRestoreHostNotificationMutation,
  useRetryHostNotificationMutation,
  useSendHostNotificationTestMailMutation,
  useUpdateHostNotificationPolicyMutation,
  type ManualOptionsQueryRequest,
} from "@/features/host/queries/host-notification-queries";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import {
  appendCursor,
  combineCursorPages,
  pageRequests,
} from "@/shared/query/cursor-pagination";
import type { HostNotificationsRouteData } from "./host-notifications-data";
import { combineManualOptions } from "./host-notifications-route-model";
import "@/features/host/ui/host-editorial-ledger.css";
import { publishTransitionAction, TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";

const HOST_NOTIFICATION_LEDGER_PAGE_LIMIT = 50;
const MANUAL_DISPATCH_PAGE_LIMIT = 20;
const MANUAL_MEMBER_PAGE_LIMIT = 50;

function contextFromClubSlug(clubSlug?: string): ExplicitReadmatesApiContext {
  return requireHostClubContext(clubSlug);
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
  const transitionOwner = useTransitionSafetyOwner("host-notifications");
  const executeAccepted = async <T,>(operationId: string, request: () => Promise<T>, publish: (result: T) => Promise<unknown>) => {
    const handle = transitionOwner.begin(operationId, "L3", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const result = await request();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      await publishTransitionAction(handle, "cache", () => publish(result));
      return result;
    } catch (error) {
      if (!(error instanceof TransitionOwnerObsoleteError)) await handle.settle("failed");
      throw error;
    }
  };
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
  const previewManualMutation = usePreviewManualNotificationMutation(context);
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
    <div className="rm-host-editorial-ledger rm-host-editorial-ledger--context">
      <HostNotificationsPage
      clubSlug={context.clubSlug}
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
      policyLoadError={
        policyQuery.isError && !policyQuery.data
          ? "자동 리마인더 정책을 불러오지 못했습니다."
          : null
      }
      policyLoading={policyQuery.isFetching && !policyQuery.data}
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
        await executeAccepted("host-notifications:process", () => processMutation.mutateAsync(), () => invalidateHostNotificationOverview(queryClient, context));
        resetLedgerPages();
      }}
      onRetry={async (id) => {
        await executeAccepted(`host-notifications:retry:${id}`, () => retryMutation.mutateAsync(id), () => invalidateHostNotificationOverview(queryClient, context));
        resetLedgerPages();
      }}
      onRestore={async (id) => {
        await executeAccepted(`host-notifications:restore:${id}`, () => restoreMutation.mutateAsync(id), () => invalidateHostNotificationOverview(queryClient, context));
        resetLedgerPages();
      }}
      onSendTestMail={async (request) => {
        await executeAccepted("host-notifications:test-mail", () => testMailMutation.mutateAsync(request), () => invalidateHostNotificationOverview(queryClient, context));
        resetLedgerPages();
      }}
      onPreviewManual={(request) => previewManualMutation.mutateAsync(request)}
      onConfirmManual={async (request) => {
        await executeAccepted(`host-notifications:confirm:${request.previewId}`, () => confirmManualMutation.mutateAsync(request), () => publishManualNotificationConfirm(queryClient, context));
        resetLedgerPages();
      }}
      onLoadManualOptions={loadManualOptions}
      onLoadMoreManualMembers={loadMoreManualMembers}
      onPolicyChange={async (enabled) => {
        setPolicyError(null);
        try {
          await executeAccepted("host-notifications:policy", () => updatePolicyMutation.mutateAsync({ sessionReminderEnabled: enabled }), (policy) => publishHostNotificationPolicy(queryClient, context, policy));
        } catch (error) {
          await publishHostNotificationPolicyFailure(queryClient, context, error);
          setPolicyError("리마인더 정책을 저장하지 못했습니다. 다시 시도해 주세요.");
          throw error;
        }
      }}
      onPolicyRetry={async () => {
        setPolicyError(null);
        await policyQuery.refetch();
      }}
      />
    </div>
  );
}
