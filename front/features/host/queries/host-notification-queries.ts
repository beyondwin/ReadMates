import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  confirmManualNotification,
  fetchHostNotificationDeliveries,
  fetchHostNotificationEvents,
  fetchHostNotificationPolicy,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  fetchManualNotificationDispatches,
  fetchManualNotificationOptions,
  previewManualNotification,
  processHostNotifications,
  restoreHostNotification,
  retryHostNotification,
  sendHostNotificationTestMail,
  updateHostNotificationPolicy,
} from "@/features/host/api/host-api";
import {
  DEFAULT_HOST_SESSION_LIST_LIMIT,
  hostSessionListQuery,
} from "@/features/host/queries/host-session-queries";
import type {
  HostNotificationDeliveryListResponse,
  HostNotificationEventListResponse,
  HostNotificationEventType,
  HostNotificationPolicyResponse,
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
  UpdateHostNotificationPolicyRequest,
} from "@/features/host/api/host-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import {
  normalizePageRequest,
  pageFromNormalizedPageRequest,
} from "@/shared/query/cursor-pagination";

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
    page: normalizePageRequest(request?.page),
  };
}

function normalizeManualDispatchesRequest(request?: ManualDispatchesQueryRequest) {
  return {
    sessionId: request?.sessionId ?? null,
    eventType: request?.eventType ?? null,
    page: normalizePageRequest(request?.page),
  };
}

export const hostNotificationKeys = {
  all: ["host", "notifications"] as const,
  policy: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.all, scopeKey(context), "policy"] as const,
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
    [...hostNotificationKeys.eventsRoot(context), normalizePageRequest(page)] as const,
  deliveriesRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "deliveries"] as const,
  deliveries: (page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.deliveriesRoot(context), normalizePageRequest(page)] as const,
  auditRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "audit"] as const,
  audit: (page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.auditRoot(context), normalizePageRequest(page)] as const,
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

export function hostNotificationPolicyQuery(context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.policy(context),
    queryFn: () => fetchHostNotificationPolicy(context),
  });
}

export function hostNotificationEventsQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.events(page, context),
    queryFn: () => fetchHostNotificationEvents(context, pageFromNormalizedPageRequest(normalizePageRequest(page))),
  });
}

export function hostNotificationDeliveriesQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.deliveries(page, context),
    queryFn: () => fetchHostNotificationDeliveries(context, pageFromNormalizedPageRequest(normalizePageRequest(page))),
  });
}

export function hostNotificationAuditQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.audit(page, context),
    queryFn: () => fetchHostNotificationTestMailAudit(context, pageFromNormalizedPageRequest(normalizePageRequest(page))),
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
      page: pageFromNormalizedPageRequest(normalized.page),
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
      page: pageFromNormalizedPageRequest(normalized.page),
    }),
  });
}

export function invalidateHostNotificationOverview(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.overview(context) });
}

export function invalidateManualNotificationState(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.manual(context) });
}

export function invalidateHostNotificationPolicy(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.policy(context) });
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

export function useUpdateHostNotificationPolicyMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  const policyKey = hostNotificationKeys.policy(context);
  return useMutation<
    HostNotificationPolicyResponse,
    Error,
    UpdateHostNotificationPolicyRequest
  >({
    mutationFn: (request) => updateHostNotificationPolicy(request, context),
    onSuccess: async (policy) => {
      client.setQueryData(policyKey, policy);
      await invalidateHostNotificationPolicy(client, context).catch(() => undefined);
    },
    onError: async () => {
      await client.refetchQueries({
        queryKey: policyKey,
        exact: true,
        type: "active",
      }).catch(() => undefined);
    },
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
        client.invalidateQueries({
          queryKey: hostNotificationKeys.manualDispatchesRoot(context),
        }),
        client.invalidateQueries({
          queryKey: hostNotificationKeys.eventsRoot(context),
        }),
        client.invalidateQueries({
          queryKey: hostNotificationKeys.deliveriesRoot(context),
        }),
        client.invalidateQueries({
          queryKey: hostNotificationKeys.summary(context),
        }),
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
  policy: HostNotificationPolicyResponse;
};
