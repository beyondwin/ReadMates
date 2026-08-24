import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  closeHostSession,
  correctionPublishHostSession,
  commitHostSessionImport,
  createHostSession,
  deleteHostSession,
  fetchHostCurrentSession,
  fetchHostMutationReconciliation,
  fetchHostSessionClosingStatus,
  fetchHostSessionDeletionPreview,
  fetchHostSessionDetail,
  fetchHostSessionTrash,
  fetchHostSessionTrashList,
  fetchHostSessions,
  fetchHostSessionList,
  restoreHostSession,
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
  HostSessionClosingStatusResponse,
  HostSessionDeletionResponse,
  HostSessionDetailResponse,
  HostSessionListPage,
  HostSessionTrashItem,
  HostSessionTrashPage,
  HostSessionPublicationRequest,
  HostSessionRequest,
  HostSessionScheduleDefaults,
  HostSessionVisibilityRequest,
  HostSessionAccessScopeRequest,
  HostSessionVisibilityUpdateResult,
  ManualNotificationDispatchListResponse,
  HostNotificationEventType,
  SessionImportRequest,
  HostMutationEnvelope,
  HostMutationOperation,
  HostMutationReconciliation,
} from "@/features/host/api/host-contracts";
import type { HostSessionReverseRequest } from "@/features/host/api/host-session-record-contracts";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
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
import { isReadmatesApiError, isReadmatesTransportError } from "@/shared/api/errors";
import { hostNotificationManualOptionsRootKey } from "./host-notification-query-key-helpers";
import { hostSessionRecordKeys } from "./host-session-record-query-keys";
import { hostClubQueryPrefix, hostMutationKey } from "./host-state-purge";

export const DEFAULT_HOST_SESSION_LIST_LIMIT = 50;

export type HostMutationReconciliationState = "idle" | "checking";

export class HostMutationPendingError extends Error {
  readonly code = "HOST_MUTATION_PENDING";

  constructor() {
    super("요청 처리 결과를 아직 확인하고 있습니다.");
    this.name = "HostMutationPendingError";
  }
}

export type ExecuteHostMutationWithReconciliationOptions<TCommand, TExpected, TResult> = {
  operation: HostMutationOperation;
  resourceSlot: string;
  envelope: HostMutationEnvelope<TCommand, TExpected>;
  context: ExplicitReadmatesApiContext;
  execute: (envelope: HostMutationEnvelope<TCommand, TExpected>) => Promise<TResult>;
  acceptCommitted: (result: HostMutationReconciliation) => Promise<TResult> | TResult;
  onStateChange?: (state: HostMutationReconciliationState) => void;
};

export async function executeHostMutationWithReconciliation<TCommand, TExpected, TResult>(
  options: ExecuteHostMutationWithReconciliationOptions<TCommand, TExpected, TResult>,
): Promise<TResult> {
  try {
    return await options.execute(options.envelope);
  } catch (error) {
    if (!isReadmatesTransportError(error)) {
      throw error;
    }
  }

  options.onStateChange?.("checking");
  try {
    const reconciliation = await fetchHostMutationReconciliation(
      options.operation,
      options.resourceSlot,
      options.envelope.idempotencyKey,
      options.context,
    );
    if (reconciliation.status === "COMMITTED") {
      return await options.acceptCommitted(reconciliation);
    }
    if (reconciliation.status === "NOT_EXECUTED") {
      return await options.execute(options.envelope);
    }
    throw new HostMutationPendingError();
  } finally {
    options.onStateChange?.("idle");
  }
}

export type HostSessionManualDispatchesQueryRequest = {
  sessionId?: string | null;
  eventType?: HostNotificationEventType | null;
  page?: PageRequest;
};

export class HostMutationContextRequiredError extends Error {
  readonly code = "HOST_API_CONTEXT_REQUIRED";

  constructor() {
    super("호스트 변경에는 명시적인 모임 컨텍스트가 필요합니다.");
    this.name = "HostMutationContextRequiredError";
  }
}

function requireHostMutationContext(context: ExplicitReadmatesApiContext): ExplicitReadmatesApiContext {
  return context;
}

function newHostMutationKey(): string {
  return `host-${globalThis.crypto.randomUUID()}`;
}

async function committedDetailResponse(
  sessionId: string,
  context: ExplicitReadmatesApiContext,
  status = 200,
): Promise<Response> {
  const detail = await fetchHostSessionDetail(sessionId, context);
  return new Response(JSON.stringify(detail), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function useReconciliationState() {
  const [reconciliationState, setReconciliationState] = useState<HostMutationReconciliationState>("idle");
  return { reconciliationState, setReconciliationState };
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
  scope: (context: ExplicitReadmatesApiContext) =>
    [...hostClubQueryPrefix(context.clubSlug), "sessions"] as const,
  lists: (context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "list"] as const,
  list: (page: PageRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.lists(context), normalizePageRequest(page)] as const,
  modeList: (mode: "meeting" | "record", page: PageRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.lists(context), "mode", mode, normalizePageRequest(page)] as const,
  detail: (sessionId: string, context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "detail", sessionId] as const,
  closingStatus: (sessionId: string, context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "closingStatus", sessionId] as const,
  current: (context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "current"] as const,
  dashboard: (context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "dashboard"] as const,
  deletionPreview: (sessionId: string, context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "deletionPreview", sessionId] as const,
  manualDispatchesRoot: (context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "manualDispatches"] as const,
  manualDispatches: (request: HostSessionManualDispatchesQueryRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.manualDispatchesRoot(context), normalizeManualDispatchesRequest(request)] as const,
  scheduleDefaults: (context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "scheduleDefaults"] as const,
  trashRoot: (context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "trash"] as const,
  trashList: (page: PageRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.trashRoot(context), normalizePageRequest(page)] as const,
  trashDetail: (sessionId: string, context: ExplicitReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "trashDetail", sessionId] as const,
} as const;

export function hostCurrentSessionQuery(context: ExplicitReadmatesApiContext) {
  return queryOptions<CurrentSessionResponse>({
    queryKey: hostSessionKeys.current(context),
    queryFn: () => fetchHostCurrentSession(context),
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

export function hostSessionScheduleDefaultsQuery(context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: hostSessionKeys.scheduleDefaults(context),
    queryFn: () => fetchHostSessionScheduleDefaults(context),
    retry: false,
  });
}

export function hostSessionListQuery(page: PageRequest | undefined, context: ExplicitReadmatesApiContext) {
  const normalized = normalizePageRequest(page);
  return queryOptions<HostSessionListPage>({
    queryKey: hostSessionKeys.list(page, context),
    queryFn: () => fetchHostSessions(context, pageFromNormalizedPageRequest(normalized)),
  });
}

export function hostMeetingSessionListQuery(page: PageRequest | undefined, context: ExplicitReadmatesApiContext) {
  const normalized = normalizePageRequest(page);
  return queryOptions<HostSessionListPage>({
    queryKey: hostSessionKeys.modeList("meeting", page, context),
    queryFn: () => fetchHostSessionList("meeting", context, pageFromNormalizedPageRequest(normalized)),
    retry: false,
  });
}

export function hostSessionDetailQuery(sessionId: string, context: ExplicitReadmatesApiContext) {
  return queryOptions<HostSessionDetailResponse>({
    queryKey: hostSessionKeys.detail(sessionId, context),
    queryFn: () => fetchHostSessionDetail(sessionId, context),
  });
}

export function hostSessionClosingStatusQuery(sessionId: string, context: ExplicitReadmatesApiContext) {
  return queryOptions<HostSessionClosingStatusResponse>({
    queryKey: hostSessionKeys.closingStatus(sessionId, context),
    queryFn: () => fetchHostSessionClosingStatus(sessionId, context),
  });
}

export function hostSessionTrashListQuery(page: PageRequest | undefined, context: ExplicitReadmatesApiContext) {
  const normalized = normalizePageRequest(page);
  return queryOptions<HostSessionTrashPage>({
    queryKey: hostSessionKeys.trashList(page, context),
    queryFn: () => fetchHostSessionTrashList(context, pageFromNormalizedPageRequest(normalized)),
  });
}

export function hostSessionTrashDetailQuery(sessionId: string, context: ExplicitReadmatesApiContext) {
  return queryOptions<HostSessionTrashItem>({
    queryKey: hostSessionKeys.trashDetail(sessionId, context),
    queryFn: () => fetchHostSessionTrash(sessionId, context),
  });
}

export function isHostSessionNotFoundError(error: unknown): boolean {
  return isReadmatesApiError(error) && error.status === 404;
}

export function isHostSessionTrashExpiredError(error: unknown): boolean {
  return isReadmatesApiError(error)
    && (error.status === 410 || error.code === "HOST_SESSION_TRASH_EXPIRED");
}

export function hostSessionDeletionPreviewQuery(sessionId: string, context: ExplicitReadmatesApiContext) {
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
  request: HostSessionManualDispatchesQueryRequest | undefined,
  context: ExplicitReadmatesApiContext,
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

export function invalidateHostSessionLists(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.lists(context) });
}

export function invalidateHostSessionDetail(client: QueryClient, sessionId: string, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.detail(sessionId, context) });
}

export function invalidateHostSessionClosingStatus(client: QueryClient, sessionId: string, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.closingStatus(sessionId, context) });
}

export function invalidateHostCurrentSession(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.current(context) });
}

export function invalidateHostSessionDashboard(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.dashboard(context) });
}

export function invalidateHostSessionManualDispatches(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.manualDispatchesRoot(context) });
}

export function invalidateHostSessionSurface(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.scope(context) });
}

export function invalidateHostSessionTrash(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.trashRoot(context) });
}

function toTrashItem(result: HostSessionDeletionResponse | HostSessionTrashItem): HostSessionTrashItem {
  return {
    sessionId: result.sessionId,
    sessionNumber: result.sessionNumber,
    title: result.title,
    state: result.state,
    deletedAt: result.deletedAt,
    purgeAfter: result.purgeAfter,
    sessionRevision: result.sessionRevision,
  };
}

function invalidateOk(response: Response, invalidate: () => Promise<unknown>) {
  return response.ok ? invalidate() : Promise.resolve();
}

async function invalidateHostSessionRecordCaches(
  client: QueryClient,
  sessionId: string,
  context: ExplicitReadmatesApiContext,
  options: { editor?: boolean; history?: boolean; ledgers?: boolean } = {},
) {
  await Promise.all([
    ...(options.editor
      ? [client.invalidateQueries({ queryKey: hostSessionRecordKeys.editor(sessionId, context), exact: true })]
      : []),
    ...(options.history
      ? [client.invalidateQueries({ queryKey: hostSessionRecordKeys.historyRoot(sessionId, context) })]
      : []),
    ...(options.ledgers
      ? [client.invalidateQueries({ queryKey: hostSessionRecordKeys.ledgers(context) })]
      : []),
  ]);
}

async function invalidateSessionMutationSurfaces(
  client: QueryClient,
  sessionId: string,
  context: ExplicitReadmatesApiContext,
  options?: { manualDispatches?: boolean },
) {
  await Promise.all([
    invalidateHostSessionDetail(client, sessionId, context),
    invalidateHostSessionClosingStatus(client, sessionId, context),
    invalidateHostSessionLists(client, context),
    invalidateHostSessionDashboard(client, context),
    invalidateHostCurrentSession(client, context),
    invalidateHostSessionRecordCaches(client, sessionId, context, {
      editor: true,
      history: true,
      ledgers: true,
    }),
    ...(options?.manualDispatches ? [invalidateHostSessionManualDispatches(client, context)] : []),
  ]);
}

export function invalidateHostSessionRecordSurfaces(
  client: QueryClient,
  sessionId: string,
  context: ExplicitReadmatesApiContext,
) {
  return invalidateSessionMutationSurfaces(client, sessionId, context);
}

export function useCreateHostSessionMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "create"),
    mutationFn: (request: HostSessionRequest) => {
      const explicitContext = requireHostMutationContext(context);
      const envelope = { idempotencyKey: newHostMutationKey(), expected: {}, command: request };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_CREATE",
        resourceSlot: "create",
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => createHostSession(exactEnvelope, explicitContext),
        acceptCommitted: (result) => {
          if (!result.receipt) {
            throw new Error("HOST_MUTATION_COMMITTED_RECEIPT_MISSING");
          }
          return committedDetailResponse(result.receipt.resourceId, explicitContext, 201);
        },
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (response) =>
      invalidateOk(response, () =>
        Promise.all([
          invalidateHostSessionLists(client, context),
          invalidateHostSessionDashboard(client, context),
        ]),
      ),
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useUpdateHostSessionMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "update"),
    mutationFn: async ({ sessionId, request }: { sessionId: string; request: HostSessionRequest }) => {
      const explicitContext = requireHostMutationContext(context);
      const detail = await client.fetchQuery(hostSessionDetailQuery(sessionId, explicitContext));
      const envelope = {
        idempotencyKey: newHostMutationKey(),
        expected: { sessionRevision: detail.versions.sessionRevision },
        command: request,
      };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_BASIC_SAVE",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => updateHostSession(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: () => committedDetailResponse(sessionId, explicitContext),
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (response, variables) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, variables.sessionId, context)),
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useDeleteHostSessionMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "delete"),
    mutationFn: async (sessionId: string) => {
      const explicitContext = requireHostMutationContext(context);
      const detail = await client.fetchQuery(hostSessionDetailQuery(sessionId, explicitContext));
      const envelope = {
        idempotencyKey: newHostMutationKey(),
        expected: { sessionRevision: detail.versions.sessionRevision },
        command: {},
      };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_TRASH",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => deleteHostSession(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: () => fetchHostSessionTrash(sessionId, explicitContext) as Promise<HostSessionDeletionResponse>,
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: async (result, sessionId) => {
      client.removeQueries({ queryKey: hostSessionKeys.detail(sessionId, context) });
      client.removeQueries({ queryKey: hostSessionRecordKeys.editor(sessionId, context) });
      client.removeQueries({ queryKey: hostSessionRecordKeys.historyRoot(sessionId, context) });
      client.setQueryData(hostSessionKeys.trashDetail(sessionId, context), toTrashItem(result));
      await Promise.all([
        invalidateHostSessionLists(client, context),
        invalidateHostSessionDashboard(client, context),
        invalidateHostCurrentSession(client, context),
        invalidateHostSessionManualDispatches(client, context),
        invalidateHostSessionTrash(client, context),
        client.invalidateQueries({ queryKey: hostSessionRecordKeys.ledgers(context) }),
      ]);
    },
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useRestoreHostSessionMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "restore"),
    mutationFn: async (sessionId: string) => {
      const explicitContext = requireHostMutationContext(context);
      const trash = await client.fetchQuery(hostSessionTrashDetailQuery(sessionId, explicitContext));
      if (trash.sessionRevision === undefined) {
        throw new Error("HOST_SESSION_TRASH_REVISION_REQUIRED");
      }
      const envelope = {
        idempotencyKey: newHostMutationKey(),
        expected: { sessionRevision: trash.sessionRevision },
        command: {},
      };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_RESTORE",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => restoreHostSession(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: () => fetchHostSessionDetail(sessionId, explicitContext),
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: async (detail, sessionId) => {
      client.setQueryData(hostSessionKeys.detail(sessionId, context), detail);
      client.removeQueries({ queryKey: hostSessionKeys.trashDetail(sessionId, context) });
      await Promise.all([
        invalidateHostSessionSurface(client, context),
        invalidateHostSessionRecordCaches(client, sessionId, context, {
          editor: true,
          history: true,
          ledgers: true,
        }),
      ]);
    },
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useOpenHostSessionMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "open"),
    mutationFn: async (sessionId: string) => {
      const explicitContext = requireHostMutationContext(context);
      const detail = await client.fetchQuery(hostSessionDetailQuery(sessionId, explicitContext));
      const envelope = {
        idempotencyKey: newHostMutationKey(),
        expected: { sessionRevision: detail.versions.sessionRevision },
        command: {},
      };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_OPEN",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => openHostSession(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: () => committedDetailResponse(sessionId, explicitContext),
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context)),
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useCloseHostSessionMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "close"),
    mutationFn: async (sessionId: string) => {
      const explicitContext = requireHostMutationContext(context);
      const closing = await client.fetchQuery(hostSessionClosingStatusQuery(sessionId, explicitContext));
      const envelope = {
        idempotencyKey: newHostMutationKey(),
        expected: {
          sessionRevision: closing.session.sessionRevision,
          participantSetRevision: closing.session.participantSetRevision,
          attendanceSnapshotId: closing.session.attendanceSnapshotId,
        },
        command: {},
      };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_CLOSE",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => closeHostSession(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: () => committedDetailResponse(sessionId, explicitContext),
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function usePublishHostSessionMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "publish"),
    mutationFn: async (sessionId: string) => {
      const explicitContext = requireHostMutationContext(context);
      const detail = await client.fetchQuery(hostSessionDetailQuery(sessionId, explicitContext));
      if (detail.versions.liveRecordRevision === null) {
        throw new Error("HOST_SESSION_LIVE_RECORD_REVISION_REQUIRED");
      }
      const envelope = {
        idempotencyKey: newHostMutationKey(),
        expected: {
          sessionRevision: detail.versions.sessionRevision,
          liveRecordRevision: detail.versions.liveRecordRevision,
          exposureRevision: detail.versions.exposureRevision,
          publicationRevision: detail.versions.publicationRevision,
        },
        command: {},
      };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_PUBLISH",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => publishHostSession(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: () => committedDetailResponse(sessionId, explicitContext),
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useCorrectionPublishHostSessionMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "correction-publish"),
    mutationFn: async (sessionId: string) => {
      const explicitContext = requireHostMutationContext(context);
      const detail = await client.fetchQuery(hostSessionDetailQuery(sessionId, explicitContext));
      if (detail.versions.recordDraftRevision === null) {
        throw new Error("HOST_SESSION_RECORD_DRAFT_REVISION_REQUIRED");
      }
      if (detail.versions.liveRecordRevision === null) {
        throw new Error("HOST_SESSION_LIVE_RECORD_REVISION_REQUIRED");
      }
      const envelope = {
        idempotencyKey: newHostMutationKey(),
        expected: {
          sessionRevision: detail.versions.sessionRevision,
          recordDraftRevision: detail.versions.recordDraftRevision,
          liveRecordRevision: detail.versions.liveRecordRevision,
          exposureRevision: detail.versions.exposureRevision,
          publicationRevision: detail.versions.publicationRevision,
        },
        command: {},
      };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_CORRECTION_PUBLISH",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => correctionPublishHostSession(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: () => committedDetailResponse(sessionId, explicitContext),
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useReopenHostSessionMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "reopen"),
    mutationFn: async ({ sessionId, request }: { sessionId: string; request: HostSessionReverseRequest }) => {
      const explicitContext = requireHostMutationContext(context);
      const detail = await client.fetchQuery(hostSessionDetailQuery(sessionId, explicitContext));
      const command = request;
      const envelope = {
        idempotencyKey: newHostMutationKey(),
        expected: { sessionRevision: detail.versions.sessionRevision },
        command,
      };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_REVERSE",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => reopenHostSession(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: () => committedDetailResponse(sessionId, explicitContext),
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (response, { sessionId }) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useUnpublishHostSessionMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "unpublish"),
    mutationFn: async ({ sessionId, request }: { sessionId: string; request: HostSessionReverseRequest }) => {
      const explicitContext = requireHostMutationContext(context);
      const detail = await client.fetchQuery(hostSessionDetailQuery(sessionId, explicitContext));
      const command = request;
      const envelope = { idempotencyKey: newHostMutationKey(), expected: { sessionRevision: detail.versions.sessionRevision }, command };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_REVERSE",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => unpublishHostSession(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: () => committedDetailResponse(sessionId, explicitContext),
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (response, { sessionId }) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useReturnHostSessionToDraftMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "return-to-draft"),
    mutationFn: async ({ sessionId, request }: { sessionId: string; request: HostSessionReverseRequest }) => {
      const explicitContext = requireHostMutationContext(context);
      const detail = await client.fetchQuery(hostSessionDetailQuery(sessionId, explicitContext));
      const command = request;
      const envelope = { idempotencyKey: newHostMutationKey(), expected: { sessionRevision: detail.versions.sessionRevision }, command };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_REVERSE",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => returnHostSessionToDraft(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: () => committedDetailResponse(sessionId, explicitContext),
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (response, { sessionId }) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useSaveHostSessionVisibilityMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation<
    HostSessionVisibilityUpdateResult,
    Error,
    { sessionId: string; request: HostSessionVisibilityRequest }
  >({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "visibility"),
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
        invalidateHostSessionRecordCaches(client, variables.sessionId, context, { editor: true, ledgers: true }),
      ]);
    },
  });
}

export function useSaveHostSessionAccessScopeMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation<
    HostSessionVisibilityUpdateResult,
    Error,
    { sessionId: string; request: HostSessionAccessScopeRequest }
  >({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "access-scope"),
    mutationFn: async ({ sessionId, request }) => {
      const explicitContext = requireHostMutationContext(context);
      const detail = await client.fetchQuery(hostSessionDetailQuery(sessionId, explicitContext));
      const envelope = {
        idempotencyKey: newHostMutationKey(),
        expected: { exposureRevision: detail.versions.exposureRevision },
        command: request,
      };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_EXPOSURE",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => saveHostSessionAccessScope(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: async () => ({
          session: await fetchHostSessionDetail(sessionId, explicitContext),
          composer: null,
        }),
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (result, variables) => {
      client.setQueryData(hostSessionKeys.detail(variables.sessionId, context), result.session);
      if (result.composer) {
        client.removeQueries({ queryKey: hostNotificationManualOptionsRootKey(context) });
      }
      return Promise.all([
        invalidateHostSessionLists(client, context),
        invalidateHostSessionDashboard(client, context),
        invalidateHostSessionRecordCaches(client, variables.sessionId, context, { editor: true, ledgers: true }),
      ]);
    },
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useSaveHostSessionPublicationMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "publication"),
    mutationFn: async ({ sessionId, request }: { sessionId: string; request: HostSessionPublicationRequest }) => {
      const explicitContext = requireHostMutationContext(context);
      const detail = await client.fetchQuery(hostSessionDetailQuery(sessionId, explicitContext));
      const envelope = {
        idempotencyKey: newHostMutationKey(),
        expected: {
          publicationRevision: detail.versions.publicationRevision,
          ...(request.accessScope === undefined
            ? {}
            : { exposureRevision: detail.versions.exposureRevision }),
        },
        command: request,
      };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_PUBLICATION",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => saveHostSessionPublication(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: () => committedDetailResponse(sessionId, explicitContext),
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (response, variables) =>
      invalidateOk(response, () =>
        Promise.all([
          invalidateHostSessionDetail(client, variables.sessionId, context),
          invalidateHostSessionLists(client, context),
          invalidateHostSessionDashboard(client, context),
          invalidateHostSessionManualDispatches(client, context),
          invalidateHostSessionRecordCaches(client, variables.sessionId, context, { editor: true, ledgers: true }),
        ]),
      ),
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useUpdateHostSessionAttendanceMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  const reconciliation = useReconciliationState();
  const mutation = useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "attendance"),
    mutationFn: async ({ sessionId, attendance }: { sessionId: string; attendance: HostAttendanceUpdate[] }) => {
      const explicitContext = requireHostMutationContext(context);
      const detail = await client.fetchQuery(hostSessionDetailQuery(sessionId, explicitContext));
      const revisionByMembership = new Map(
        detail.attendees.map((attendee) => [attendee.membershipId, attendee.attendanceRevision]),
      );
      const entries = attendance.map((entry) => {
        const expectedAttendanceRevision = revisionByMembership.get(entry.membershipId);
        if (expectedAttendanceRevision === undefined) {
          throw new Error("HOST_ATTENDANCE_REVISION_REQUIRED");
        }
        return { ...entry, expectedAttendanceRevision };
      });
      const envelope = {
        idempotencyKey: newHostMutationKey(),
        expected: {
          rows: entries.map((entry) => ({
            membershipId: entry.membershipId,
            attendanceRevision: entry.expectedAttendanceRevision,
          })),
          ...(entries.length > 1
            ? { participantSetRevision: detail.versions.participantSetRevision }
            : {}),
        },
        command: { entries },
      };
      return executeHostMutationWithReconciliation({
        operation: entries.length > 1 ? "SESSION_ATTENDANCE_BULK" : "SESSION_ATTENDANCE_SINGLE",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => saveHostSessionAttendance(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: async () => {
          await fetchHostSessionDetail(sessionId, explicitContext);
          return { sessionId, count: entries.length };
        },
        onStateChange: reconciliation.setReconciliationState,
      });
    },
    onSuccess: (_result, variables) =>
      Promise.all([
        invalidateHostSessionDetail(client, variables.sessionId, context),
        invalidateHostCurrentSession(client, context),
        invalidateHostSessionRecordCaches(client, variables.sessionId, context, {
          history: true,
          ledgers: true,
        }),
      ]),
  });
  return { ...mutation, reconciliationState: reconciliation.reconciliationState };
}

export function useCommitHostSessionImportMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "sessions", "import"),
    mutationFn: ({ sessionId, request }: { sessionId: string; request: SessionImportRequest }) =>
      commitHostSessionImport(sessionId, request, context),
    onSuccess: (_response, variables) =>
      Promise.all([
        invalidateHostSessionDetail(client, variables.sessionId, context),
        invalidateHostSessionLists(client, context),
        invalidateHostSessionDashboard(client, context),
        invalidateHostCurrentSession(client, context),
        invalidateHostSessionRecordCaches(client, variables.sessionId, context, {
          editor: true,
          history: true,
          ledgers: true,
        }),
      ]),
  });
}
