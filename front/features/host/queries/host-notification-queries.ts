import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation } from "@tanstack/react-query";
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
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import { HostRequestPurgedError } from "@/shared/api/host-authority-event";
import type { PageRequest } from "@/shared/model/paging";
import {
  normalizePageRequest,
  pageFromNormalizedPageRequest,
} from "@/shared/query/cursor-pagination";
import { hostNotificationManualOptionsRootKey } from "./host-notification-query-key-helpers";
import { hostClubQueryPrefix, hostMutationKey } from "./host-state-purge";

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
  scope: (context: ExplicitReadmatesApiContext) =>
    [...hostClubQueryPrefix(context.clubSlug), "notifications"] as const,
  policy: (context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.scope(context), "policy"] as const,
  overview: (context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.scope(context), "overview"] as const,
  manual: (context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.scope(context), "manual"] as const,
  summary: (context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "summary"] as const,
  eventsRoot: (context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "events"] as const,
  events: (page: PageRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.eventsRoot(context), normalizePageRequest(page)] as const,
  deliveriesRoot: (context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "deliveries"] as const,
  deliveries: (page: PageRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.deliveriesRoot(context), normalizePageRequest(page)] as const,
  auditRoot: (context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "audit"] as const,
  audit: (page: PageRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.auditRoot(context), normalizePageRequest(page)] as const,
  manualOptionsRoot: (context: ExplicitReadmatesApiContext) =>
    hostNotificationManualOptionsRootKey(context),
  manualOptions: (request: ManualOptionsQueryRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.manualOptionsRoot(context), normalizeManualOptionsRequest(request)] as const,
  manualDispatchesRoot: (context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.manual(context), "dispatches"] as const,
  manualDispatches: (request: ManualDispatchesQueryRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostNotificationKeys.manualDispatchesRoot(context), normalizeManualDispatchesRequest(request)] as const,
} as const;

export function shouldRecoverHostNotificationMutation(error: unknown): boolean {
  return !(error instanceof HostRequestPurgedError);
}

export function hostNotificationSummaryQuery(context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.summary(context),
    queryFn: () => fetchHostNotificationSummary(context),
  });
}

export function hostNotificationHealthQuery(context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.summary(context),
    queryFn: () => fetchHostNotificationSummary(context),
    retry: false,
  });
}

export function hostNotificationPolicyQuery(context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.policy(context),
    queryFn: () => fetchHostNotificationPolicy(context),
  });
}

export function hostNotificationEventsQuery(page: PageRequest | undefined, context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.events(page, context),
    queryFn: () => fetchHostNotificationEvents(context, pageFromNormalizedPageRequest(normalizePageRequest(page))),
  });
}

export function hostNotificationDeliveriesQuery(page: PageRequest | undefined, context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.deliveries(page, context),
    queryFn: () => fetchHostNotificationDeliveries(context, pageFromNormalizedPageRequest(normalizePageRequest(page))),
  });
}

export function hostNotificationAuditQuery(page: PageRequest | undefined, context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.audit(page, context),
    queryFn: () => fetchHostNotificationTestMailAudit(context, pageFromNormalizedPageRequest(normalizePageRequest(page))),
  });
}

export function hostNotificationSessionsQuery(context: ExplicitReadmatesApiContext) {
  return hostSessionListQuery({ limit: DEFAULT_HOST_SESSION_LIST_LIMIT }, context);
}

export function hostNotificationManualOptionsQuery(
  request: ManualOptionsQueryRequest | undefined,
  context: ExplicitReadmatesApiContext,
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
  request: ManualDispatchesQueryRequest | undefined,
  context: ExplicitReadmatesApiContext,
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

export function invalidateHostNotificationOverview(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.overview(context) });
}

export function invalidateManualNotificationState(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.manual(context) });
}

export function invalidateHostNotificationPolicy(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.policy(context) });
}

export function invalidateHostNotifications(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.scope(context) });
}

async function processHostNotificationsOrThrow(context: ExplicitReadmatesApiContext): Promise<void> {
  const response = await processHostNotifications(context);
  if (!response.ok) {
    throw new Error("Notification process failed");
  }
}

export function useProcessHostNotificationsMutation(context: ExplicitReadmatesApiContext) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "notifications", "process"),
    mutationFn: () => processHostNotificationsOrThrow(context),
  });
}

export function useRetryHostNotificationMutation(context: ExplicitReadmatesApiContext) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "notifications", "retry"),
    mutationFn: (id: string) => retryHostNotification(id, context),
  });
}

export function useRestoreHostNotificationMutation(context: ExplicitReadmatesApiContext) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "notifications", "restore"),
    mutationFn: (id: string) => restoreHostNotification(id, context),
  });
}

export function useSendHostNotificationTestMailMutation(context: ExplicitReadmatesApiContext) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "notifications", "test-mail"),
    mutationFn: (request: SendNotificationTestMailRequest) => sendHostNotificationTestMail(request, context),
  });
}

export function useUpdateHostNotificationPolicyMutation(context: ExplicitReadmatesApiContext) {
  return useMutation<
    HostNotificationPolicyResponse,
    Error,
    UpdateHostNotificationPolicyRequest
  >({
    mutationKey: hostMutationKey(context.clubSlug, "notifications", "policy"),
    mutationFn: (request) => updateHostNotificationPolicy(request, context),
  });
}

export function usePreviewManualNotificationMutation(context: ExplicitReadmatesApiContext) {
  return useMutation<ManualNotificationPreviewResponse, Error, ManualNotificationPreviewRequest>({
    mutationKey: hostMutationKey(context.clubSlug, "notifications", "preview"),
    mutationFn: (request) => previewManualNotification(request, context),
  });
}

export function useConfirmManualNotificationMutation(context: ExplicitReadmatesApiContext) {
  return useMutation<ManualNotificationConfirmResponse, Error, ManualNotificationConfirmRequest>({
    mutationKey: hostMutationKey(context.clubSlug, "notifications", "confirm"),
    mutationFn: (request) => confirmManualNotification(request, context),
  });
}

export async function publishHostNotificationPolicy(
  client: QueryClient,
  context: ExplicitReadmatesApiContext,
  policy: HostNotificationPolicyResponse,
) {
  client.setQueryData(hostNotificationKeys.policy(context), policy);
  await invalidateHostNotificationPolicy(client, context).catch(() => undefined);
}

export async function publishHostNotificationPolicyFailure(client: QueryClient, context: ExplicitReadmatesApiContext, error: unknown) {
  if (!shouldRecoverHostNotificationMutation(error)) return;
  await client.refetchQueries({ queryKey: hostNotificationKeys.policy(context), exact: true, type: "active" }).catch(() => undefined);
}

export async function publishManualNotificationConfirm(client: QueryClient, context: ExplicitReadmatesApiContext) {
  await Promise.all([
    client.invalidateQueries({ queryKey: hostNotificationKeys.manualDispatchesRoot(context) }),
    client.invalidateQueries({ queryKey: hostNotificationKeys.eventsRoot(context) }),
    client.invalidateQueries({ queryKey: hostNotificationKeys.deliveriesRoot(context) }),
    client.invalidateQueries({ queryKey: hostNotificationKeys.summary(context) }),
  ]);
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
