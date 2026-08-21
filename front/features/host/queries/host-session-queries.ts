import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  closeHostSession,
  commitHostSessionImport,
  createHostSession,
  deleteHostSession,
  fetchHostCurrentSession,
  fetchHostDashboard,
  fetchHostSessionClosingStatus,
  fetchHostSessionDeletionPreview,
  fetchHostSessionDetail,
  fetchHostSessions,
  fetchHostSessionScheduleDefaults,
  fetchManualNotificationDispatches,
  openHostSession,
  publishHostSession,
  reopenHostSession,
  returnHostSessionToDraft,
  saveHostSessionAttendance,
  saveHostSessionAccessScope,
  saveHostSessionPublication,
  saveHostSessionVisibility,
  unpublishHostSession,
  updateHostSession,
} from "@/features/host/api/host-api";
import type {
  CurrentSessionResponse,
  HostAttendanceUpdate,
  HostDashboardResponse,
  HostSessionClosingStatusResponse,
  HostSessionDetailResponse,
  HostSessionListPage,
  HostSessionPublicationRequest,
  HostSessionRequest,
  HostSessionScheduleDefaults,
  HostSessionVisibilityRequest,
  HostSessionAccessScopeRequest,
  HostSessionVisibilityUpdateResult,
  ManualNotificationDispatchListResponse,
  HostNotificationEventType,
  SessionImportRequest,
} from "@/features/host/api/host-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import {
  normalizePageRequest,
  pageFromNormalizedPageRequest,
} from "@/shared/query/cursor-pagination";
import {
  BUILTIN_SCHEDULE_DEFAULTS,
  SCHEDULE_DEFAULTS_LOAD_WARNING,
  type HostScheduleDefaultsLoadState,
} from "@/features/host/model/host-schedule-defaults-model";
import { isReadmatesApiError } from "@/shared/api/errors";
import { hostNotificationManualOptionsRootKey } from "./host-notification-query-key-helpers";

export const DEFAULT_HOST_SESSION_LIST_LIMIT = 50;

export type HostSessionManualDispatchesQueryRequest = {
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

function normalizeManualDispatchesRequest(request?: HostSessionManualDispatchesQueryRequest) {
  return {
    sessionId: request?.sessionId ?? null,
    eventType: request?.eventType ?? null,
    page: normalizePageRequest(request?.page),
  };
}

export const hostSessionKeys = {
  all: ["host", "sessions"] as const,
  scope: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.all, "scope", scopeKey(context)] as const,
  lists: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "list"] as const,
  list: (page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostSessionKeys.lists(context), normalizePageRequest(page)] as const,
  detail: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "detail", sessionId] as const,
  closingStatus: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "closingStatus", sessionId] as const,
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
  scheduleDefaults: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "scheduleDefaults"] as const,
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

export type ScheduleDefaultsErrorKind = "legacy-404" | "visible-error";

export function classifyScheduleDefaultsError(error: unknown): { kind: ScheduleDefaultsErrorKind } {
  return isReadmatesApiError(error) && error.status === 404
    ? { kind: "legacy-404" }
    : { kind: "visible-error" };
}

export function resolveHostScheduleDefaultsLoadState(query: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: HostSessionScheduleDefaults | undefined;
  refetch: () => unknown;
}): HostScheduleDefaultsLoadState {
  const retry = () => {
    void query.refetch();
  };
  if (query.isPending) {
    return {
      defaults: BUILTIN_SCHEDULE_DEFAULTS,
      status: "loading",
      warning: null,
      retry,
    };
  }
  if (query.isError) {
    if (classifyScheduleDefaultsError(query.error).kind === "legacy-404") {
      return {
        defaults: BUILTIN_SCHEDULE_DEFAULTS,
        status: "ready",
        warning: null,
        retry,
      };
    }
    return {
      defaults: BUILTIN_SCHEDULE_DEFAULTS,
      status: "warning",
      warning: SCHEDULE_DEFAULTS_LOAD_WARNING,
      retry,
    };
  }
  return {
    defaults: query.data ?? BUILTIN_SCHEDULE_DEFAULTS,
    status: "ready",
    warning: null,
    retry,
  };
}

export function hostSessionScheduleDefaultsQuery(context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostSessionKeys.scheduleDefaults(context),
    queryFn: () => fetchHostSessionScheduleDefaults(context),
    retry: false,
  });
}

export function hostSessionListQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  const normalized = normalizePageRequest(page);
  return queryOptions<HostSessionListPage>({
    queryKey: hostSessionKeys.list(page, context),
    queryFn: () => fetchHostSessions(context, pageFromNormalizedPageRequest(normalized)),
  });
}

export function hostSessionDetailQuery(sessionId: string, context?: ReadmatesApiContext) {
  return queryOptions<HostSessionDetailResponse>({
    queryKey: hostSessionKeys.detail(sessionId, context),
    queryFn: () => fetchHostSessionDetail(sessionId, context),
  });
}

export function hostSessionClosingStatusQuery(sessionId: string, context?: ReadmatesApiContext) {
  return queryOptions<HostSessionClosingStatusResponse>({
    queryKey: hostSessionKeys.closingStatus(sessionId, context),
    queryFn: () => fetchHostSessionClosingStatus(sessionId, context),
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
      page: pageFromNormalizedPageRequest(normalized.page),
    }),
  });
}

export function invalidateHostSessionLists(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.lists(context) });
}

export function invalidateHostSessionDetail(client: QueryClient, sessionId: string, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.detail(sessionId, context) });
}

export function invalidateHostSessionClosingStatus(client: QueryClient, sessionId: string, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.closingStatus(sessionId, context) });
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

function invalidateOk(response: Response, invalidate: () => Promise<unknown>) {
  return response.ok ? invalidate() : Promise.resolve();
}

async function invalidateSessionMutationSurfaces(
  client: QueryClient,
  sessionId: string,
  context?: ReadmatesApiContext,
  options?: { manualDispatches?: boolean },
) {
  await Promise.all([
    invalidateHostSessionDetail(client, sessionId, context),
    invalidateHostSessionClosingStatus(client, sessionId, context),
    invalidateHostSessionLists(client, context),
    invalidateHostSessionDashboard(client, context),
    invalidateHostCurrentSession(client, context),
    ...(options?.manualDispatches ? [invalidateHostSessionManualDispatches(client, context)] : []),
  ]);
}

export function invalidateHostSessionRecordSurfaces(
  client: QueryClient,
  sessionId: string,
  context?: ReadmatesApiContext,
) {
  return invalidateSessionMutationSurfaces(client, sessionId, context);
}

export function useCreateHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: HostSessionRequest) => createHostSession(request),
    onSuccess: (response) =>
      invalidateOk(response, () =>
        Promise.all([
          invalidateHostSessionLists(client, context),
          invalidateHostSessionDashboard(client, context),
        ]),
      ),
  });
}

export function useUpdateHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, request }: { sessionId: string; request: HostSessionRequest }) =>
      updateHostSession(sessionId, request),
    onSuccess: (response, variables) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, variables.sessionId, context)),
  });
}

export function useDeleteHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => deleteHostSession(sessionId),
    onSuccess: async (_result, sessionId) => {
      client.removeQueries({ queryKey: hostSessionKeys.detail(sessionId, context) });
      await Promise.all([
        invalidateHostSessionLists(client, context),
        invalidateHostSessionDashboard(client, context),
        invalidateHostCurrentSession(client, context),
        invalidateHostSessionManualDispatches(client, context),
      ]);
    },
  });
}

export function useOpenHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => openHostSession(sessionId),
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context)),
  });
}

export function useCloseHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => closeHostSession(sessionId),
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
}

export function usePublishHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => publishHostSession(sessionId),
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
}

export function useReopenHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => reopenHostSession(sessionId),
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
}

export function useUnpublishHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => unpublishHostSession(sessionId),
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
}

export function useReturnHostSessionToDraftMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => returnHostSessionToDraft(sessionId),
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
}

export function useSaveHostSessionVisibilityMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation<
    HostSessionVisibilityUpdateResult,
    Error,
    { sessionId: string; request: HostSessionVisibilityRequest }
  >({
    mutationFn: ({ sessionId, request }: { sessionId: string; request: HostSessionVisibilityRequest }) =>
      saveHostSessionVisibility(sessionId, request, context),
    onSuccess: (result, variables) => {
      client.setQueryData(
        hostSessionKeys.detail(variables.sessionId, context),
        result.session,
      );
      if (result.composer) {
        client.removeQueries({
          queryKey: hostNotificationManualOptionsRootKey(context),
        });
      }
      return Promise.all([
        invalidateHostSessionLists(client, context),
        invalidateHostSessionDashboard(client, context),
      ]);
    },
  });
}

export function useSaveHostSessionAccessScopeMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation<
    HostSessionVisibilityUpdateResult,
    Error,
    { sessionId: string; request: HostSessionAccessScopeRequest }
  >({
    mutationFn: ({ sessionId, request }) => saveHostSessionAccessScope(sessionId, request, context),
    onSuccess: (result, variables) => {
      client.setQueryData(hostSessionKeys.detail(variables.sessionId, context), result.session);
      if (result.composer) {
        client.removeQueries({ queryKey: hostNotificationManualOptionsRootKey(context) });
      }
      return Promise.all([
        invalidateHostSessionLists(client, context),
        invalidateHostSessionDashboard(client, context),
      ]);
    },
  });
}

export function useSaveHostSessionPublicationMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, request }: { sessionId: string; request: HostSessionPublicationRequest }) =>
      saveHostSessionPublication(sessionId, request),
    onSuccess: (response, variables) =>
      invalidateOk(response, () =>
        Promise.all([
          invalidateHostSessionDetail(client, variables.sessionId, context),
          invalidateHostSessionLists(client, context),
          invalidateHostSessionDashboard(client, context),
          invalidateHostSessionManualDispatches(client, context),
        ]),
      ),
  });
}

export function useUpdateHostSessionAttendanceMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, attendance }: { sessionId: string; attendance: HostAttendanceUpdate[] }) =>
      saveHostSessionAttendance(sessionId, attendance),
    onSuccess: (response, variables) =>
      invalidateOk(response, () =>
        Promise.all([
          invalidateHostSessionDetail(client, variables.sessionId, context),
          invalidateHostCurrentSession(client, context),
        ]),
      ),
  });
}

export function useCommitHostSessionImportMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, request }: { sessionId: string; request: SessionImportRequest }) =>
      commitHostSessionImport(sessionId, request),
    onSuccess: (_response, variables) =>
      Promise.all([
        invalidateHostSessionDetail(client, variables.sessionId, context),
        invalidateHostSessionLists(client, context),
        invalidateHostSessionDashboard(client, context),
        invalidateHostCurrentSession(client, context),
      ]),
  });
}
