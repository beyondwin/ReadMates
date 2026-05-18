import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  confirmManualNotification,
  fetchHostNotificationDeliveries,
  fetchHostNotificationEvents,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  fetchManualNotificationDispatches,
  fetchManualNotificationOptions,
  previewManualNotification,
  processHostNotifications,
  restoreHostNotification,
  retryHostNotification,
  sendHostNotificationTestMail,
} from "@/features/host/api/host-api";
import {
  DEFAULT_HOST_SESSION_LIST_LIMIT,
  hostSessionListQuery,
} from "@/features/host/queries/host-session-queries";
import type {
  HostNotificationDeliveryListResponse,
  HostNotificationEventListResponse,
  HostNotificationEventType,
  HostNotificationSummary,
  HostSessionListPage,
  ManualNotificationConfirmRequest,
  ManualNotificationConfirmResponse,
  ManualNotificationDispatchListResponse,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewRequest,
  ManualNotificationPreviewResponse,
  NotificationTestMailAuditPage,
  SendNotificationTestMailRequest,
} from "@/features/host/api/host-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";

type NormalizedPageRequest = {
  limit: number | null;
  cursor: string | null;
};

export type ManualOptionsQueryRequest = {
  sessionId?: string | null;
  search?: string | null;
  page?: PageRequest;
};

export type ManualDispatchesQueryRequest = {
  sessionId?: string | null;
  eventType?: HostNotificationEventType | null;
  page?: PageRequest;
};

function scopeKey(context?: ReadmatesApiContext): string | null {
  return context?.clubSlug ?? null;
}

function normalizePage(page?: PageRequest): NormalizedPageRequest {
  return {
    limit: page?.limit ?? null,
    cursor: page?.cursor ?? null,
  };
}

function pageFromNormalized(page: NormalizedPageRequest): PageRequest | undefined {
  if (page.limit === null && page.cursor === null) {
    return undefined;
  }

  return {
    ...(page.limit !== null ? { limit: page.limit } : {}),
    ...(page.cursor !== null ? { cursor: page.cursor } : {}),
  };
}

function optional(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function normalizeSearch(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeManualOptionsRequest(request?: ManualOptionsQueryRequest) {
  return {
    sessionId: request?.sessionId ?? null,
    search: normalizeSearch(request?.search),
    page: normalizePage(request?.page),
  };
}

function normalizeManualDispatchesRequest(request?: ManualDispatchesQueryRequest) {
  return {
    sessionId: request?.sessionId ?? null,
    eventType: request?.eventType ?? null,
    page: normalizePage(request?.page),
  };
}

export const hostNotificationKeys = {
  all: ["host", "notifications"] as const,
  scope: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.all, "scope", scopeKey(context)] as const,
  overview: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.scope(context), "overview"] as const,
  manual: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.scope(context), "manual"] as const,
  summary: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "summary"] as const,
  eventsRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "events"] as const,
  events: (page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.eventsRoot(context), normalizePage(page)] as const,
  deliveriesRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "deliveries"] as const,
  deliveries: (page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.deliveriesRoot(context), normalizePage(page)] as const,
  auditRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "audit"] as const,
  audit: (page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.auditRoot(context), normalizePage(page)] as const,
  manualOptionsRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.manual(context), "options"] as const,
  manualOptions: (request?: ManualOptionsQueryRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.manualOptionsRoot(context), normalizeManualOptionsRequest(request)] as const,
  manualDispatchesRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.manual(context), "dispatches"] as const,
  manualDispatches: (request?: ManualDispatchesQueryRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.manualDispatchesRoot(context), normalizeManualDispatchesRequest(request)] as const,
} as const;

export function hostNotificationSummaryQuery(context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.summary(context),
    queryFn: () => fetchHostNotificationSummary(context),
  });
}

export function hostNotificationEventsQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.events(page, context),
    queryFn: () => fetchHostNotificationEvents(context, pageFromNormalized(normalizePage(page))),
  });
}

export function hostNotificationDeliveriesQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.deliveries(page, context),
    queryFn: () => fetchHostNotificationDeliveries(context, pageFromNormalized(normalizePage(page))),
  });
}

export function hostNotificationAuditQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.audit(page, context),
    queryFn: () => fetchHostNotificationTestMailAudit(context, pageFromNormalized(normalizePage(page))),
  });
}

export function hostNotificationSessionsQuery(context?: ReadmatesApiContext) {
  return hostSessionListQuery({ limit: DEFAULT_HOST_SESSION_LIST_LIMIT }, context);
}

export function hostNotificationManualOptionsQuery(
  request?: ManualOptionsQueryRequest,
  context?: ReadmatesApiContext,
) {
  const normalized = normalizeManualOptionsRequest(request);
  return queryOptions({
    queryKey: hostNotificationKeys.manualOptions(request, context),
    queryFn: () => fetchManualNotificationOptions(context, {
      sessionId: optional(normalized.sessionId),
      search: optional(normalized.search),
      page: pageFromNormalized(normalized.page),
    }),
  });
}

export function hostNotificationManualDispatchesQuery(
  request?: ManualDispatchesQueryRequest,
  context?: ReadmatesApiContext,
) {
  const normalized = normalizeManualDispatchesRequest(request);
  return queryOptions({
    queryKey: hostNotificationKeys.manualDispatches(request, context),
    queryFn: () => fetchManualNotificationDispatches(context, {
      sessionId: optional(normalized.sessionId),
      eventType: normalized.eventType ?? undefined,
      page: pageFromNormalized(normalized.page),
    }),
  });
}

export function invalidateHostNotificationOverview(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.overview(context) });
}

export function invalidateManualNotificationState(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.manual(context) });
}

export function invalidateHostNotifications(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.scope(context) });
}

async function processHostNotificationsOrThrow(): Promise<void> {
  const response = await processHostNotifications();
  if (!response.ok) {
    throw new Error("Notification process failed");
  }
}

export function useProcessHostNotificationsMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: processHostNotificationsOrThrow,
    onSuccess: () => invalidateHostNotificationOverview(client, context),
  });
}

export function useRetryHostNotificationMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryHostNotification(id),
    onSuccess: () => invalidateHostNotificationOverview(client, context),
  });
}

export function useRestoreHostNotificationMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreHostNotification(id),
    onSuccess: () => invalidateHostNotificationOverview(client, context),
  });
}

export function useSendHostNotificationTestMailMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: SendNotificationTestMailRequest) => sendHostNotificationTestMail(request),
    onSuccess: () => invalidateHostNotificationOverview(client, context),
  });
}

export function usePreviewManualNotificationMutation() {
  return useMutation<ManualNotificationPreviewResponse, Error, ManualNotificationPreviewRequest>({
    mutationFn: (request) => previewManualNotification(request),
  });
}

export function useConfirmManualNotificationMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation<ManualNotificationConfirmResponse, Error, ManualNotificationConfirmRequest>({
    mutationFn: (request) => confirmManualNotification(request),
    onSuccess: async () => {
      await Promise.all([
        invalidateHostNotificationOverview(client, context),
        invalidateManualNotificationState(client, context),
      ]);
    },
  });
}

export type HostNotificationQueryData = {
  summary: HostNotificationSummary;
  events: HostNotificationEventListResponse;
  deliveries: HostNotificationDeliveryListResponse;
  audit: NotificationTestMailAuditPage;
  hostSessions: HostSessionListPage;
  manualOptions: ManualNotificationOptionsResponse;
  manualDispatches: ManualNotificationDispatchListResponse;
};
