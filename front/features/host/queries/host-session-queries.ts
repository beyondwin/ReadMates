import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import {
  fetchHostCurrentSession,
  fetchHostDashboard,
  fetchHostSessionDeletionPreview,
  fetchHostSessionDetail,
  fetchHostSessions,
  fetchManualNotificationDispatches,
} from "@/features/host/api/host-api";
import type {
  CurrentSessionResponse,
  HostDashboardResponse,
  HostSessionDetailResponse,
  HostSessionListPage,
  ManualNotificationDispatchListResponse,
  HostNotificationEventType,
} from "@/features/host/api/host-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";

type NormalizedPageRequest = {
  limit: number | null;
  cursor: string | null;
};

export type HostSessionManualDispatchesQueryRequest = {
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

function normalizeManualDispatchesRequest(request?: HostSessionManualDispatchesQueryRequest) {
  return {
    sessionId: request?.sessionId ?? null,
    eventType: request?.eventType ?? null,
    page: normalizePage(request?.page),
  };
}

export const hostSessionKeys = {
  all: ["host", "sessions"] as const,
  scope: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.all, "scope", scopeKey(context)] as const,
  lists: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "list"] as const,
  list: (page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostSessionKeys.lists(context), normalizePage(page)] as const,
  detail: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "detail", sessionId] as const,
  current: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "current"] as const,
  dashboard: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "dashboard"] as const,
  deletionPreview: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "deletionPreview", sessionId] as const,
  manualDispatchesRoot: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "manualDispatches"] as const,
  manualDispatches: (request?: HostSessionManualDispatchesQueryRequest, context?: ReadmatesApiContext) =>
    [...hostSessionKeys.manualDispatchesRoot(context), normalizeManualDispatchesRequest(request)] as const,
} as const;

export function hostCurrentSessionQuery(context?: ReadmatesApiContext) {
  return queryOptions<CurrentSessionResponse>({
    queryKey: hostSessionKeys.current(context),
    queryFn: () => fetchHostCurrentSession(context),
  });
}

export function hostDashboardQuery(context?: ReadmatesApiContext) {
  return queryOptions<HostDashboardResponse>({
    queryKey: hostSessionKeys.dashboard(context),
    queryFn: () => fetchHostDashboard(context),
  });
}

export function hostSessionListQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  const normalized = normalizePage(page);
  return queryOptions<HostSessionListPage>({
    queryKey: hostSessionKeys.list(page, context),
    queryFn: () => fetchHostSessions(context, pageFromNormalized(normalized)),
  });
}

export function hostSessionDetailQuery(sessionId: string, context?: ReadmatesApiContext) {
  return queryOptions<HostSessionDetailResponse>({
    queryKey: hostSessionKeys.detail(sessionId, context),
    queryFn: () => fetchHostSessionDetail(sessionId, context),
  });
}

export function hostSessionDeletionPreviewQuery(sessionId: string, context?: ReadmatesApiContext) {
  // Each click currently issues a fresh request; opt out of result retention so the
  // delete-preview UX continues to reflect the server state at click time even after
  // an interleaved publish / close / update has mutated the underlying session.
  return queryOptions({
    queryKey: hostSessionKeys.deletionPreview(sessionId, context),
    queryFn: () => fetchHostSessionDeletionPreview(sessionId, context),
    staleTime: 0,
    gcTime: 0,
  });
}

export function hostSessionManualDispatchesQuery(
  request?: HostSessionManualDispatchesQueryRequest,
  context?: ReadmatesApiContext,
) {
  const normalized = normalizeManualDispatchesRequest(request);
  return queryOptions<ManualNotificationDispatchListResponse>({
    queryKey: hostSessionKeys.manualDispatches(request, context),
    queryFn: () => fetchManualNotificationDispatches(context, {
      sessionId: optional(normalized.sessionId),
      eventType: normalized.eventType ?? undefined,
      page: pageFromNormalized(normalized.page),
    }),
  });
}

export function invalidateHostSessionLists(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.lists(context) });
}

export function invalidateHostSessionDetail(client: QueryClient, sessionId: string, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.detail(sessionId, context) });
}

export function invalidateHostCurrentSession(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.current(context) });
}

export function invalidateHostSessionDashboard(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.dashboard(context) });
}

export function invalidateHostSessionManualDispatches(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.manualDispatchesRoot(context) });
}

export function invalidateHostSessionSurface(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.scope(context) });
}
