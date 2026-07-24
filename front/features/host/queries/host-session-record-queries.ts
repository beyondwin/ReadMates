import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  applyHostSessionRecord,
  deleteHostSessionRecordDraft,
  fetchHostSessionHistory,
  fetchHostSessionRecordCapabilities,
  fetchHostSessionRecordEditor,
  fetchHostSessionRecordLedger,
  previewHostSessionRecordApply,
  restoreHostSessionRevisionToDraft,
  saveHostSessionRecordDraft,
} from "@/features/host/api/host-session-record-api";
import type {
  HostSessionLedgerRequest,
  HostSessionRecordApplyPreview,
  HostSessionRecordApplyRequest,
  HostSessionRecordApplyResult,
  HostSessionRecordDraft,
  HostSessionRecordEditor,
  PreviewHostSessionRecordApplyRequest,
  RestoreHostSessionRecordDraftRequest,
  SaveHostSessionRecordDraftRequest,
} from "@/features/host/api/host-session-record-contracts";
import { normalizeHostSessionLedgerRequest } from "@/features/host/api/host-session-record-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import { normalizePageRequest } from "@/shared/query/cursor-pagination";
import { invalidateHostSessionDashboard } from "./host-session-queries";

function scopeKey(context?: ReadmatesApiContext) {
  return context?.clubSlug ?? null;
}

export const hostSessionRecordKeys = {
  all: ["host", "session-records"] as const,
  scope: (context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.all, scopeKey(context)] as const,
  capabilities: (context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "capabilities"] as const,
  ledgers: (context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "ledger"] as const,
  ledger: (request?: HostSessionLedgerRequest, context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.ledgers(context), normalizeHostSessionLedgerRequest(request)] as const,
  editor: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "editor", sessionId] as const,
  historyRoot: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "history", sessionId] as const,
  history: (sessionId: string, page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.historyRoot(sessionId, context), normalizePageRequest(page)] as const,
} as const;

export function hostSessionRecordCapabilitiesQuery(context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostSessionRecordKeys.capabilities(context),
    queryFn: () => fetchHostSessionRecordCapabilities(context),
  });
}

export function hostSessionRecordLedgerQuery(
  request?: HostSessionLedgerRequest,
  context?: ReadmatesApiContext,
) {
  const normalizedRequest = normalizeHostSessionLedgerRequest(request);
  return queryOptions({
    queryKey: hostSessionRecordKeys.ledger(normalizedRequest, context),
    queryFn: () => fetchHostSessionRecordLedger(normalizedRequest, context),
  });
}

export function hostSessionRecordEditorQuery(sessionId: string, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostSessionRecordKeys.editor(sessionId, context),
    queryFn: () => fetchHostSessionRecordEditor(sessionId, context),
  });
}

export function hostSessionRecordHistoryQuery(
  sessionId: string,
  page?: PageRequest,
  context?: ReadmatesApiContext,
) {
  return queryOptions({
    queryKey: hostSessionRecordKeys.history(sessionId, page, context),
    queryFn: () => fetchHostSessionHistory(sessionId, page, context),
  });
}

function updateEditorDraft(
  client: QueryClient,
  sessionId: string,
  context: ReadmatesApiContext | undefined,
  draft: HostSessionRecordDraft | null,
) {
  client.setQueryData<HostSessionRecordEditor>(
    hostSessionRecordKeys.editor(sessionId, context),
    (editor) => editor
      ? {
          ...editor,
          draft,
          draftLiveBaseStale: draft ? draft.baseLiveRevision !== editor.liveRevision : false,
        }
      : editor,
  );
}

export function useSaveHostSessionRecordDraftMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, request }: {
      sessionId: string;
      request: SaveHostSessionRecordDraftRequest;
    }) => saveHostSessionRecordDraft(sessionId, request, context),
    onSuccess: (draft, variables) => updateEditorDraft(client, variables.sessionId, context, draft),
  });
}

export function useDeleteHostSessionRecordDraftMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, expectedDraftRevision }: {
      sessionId: string;
      expectedDraftRevision: number;
    }) => deleteHostSessionRecordDraft(sessionId, expectedDraftRevision, context),
    onSuccess: (_response, variables) => updateEditorDraft(client, variables.sessionId, context, null),
  });
}

export function usePreviewHostSessionRecordApplyMutation(context?: ReadmatesApiContext) {
  return useMutation<
    HostSessionRecordApplyPreview,
    Error,
    {
      sessionId: string;
      request: PreviewHostSessionRecordApplyRequest;
    }
  >({
    mutationFn: ({ sessionId, request }: {
      sessionId: string;
      request: PreviewHostSessionRecordApplyRequest;
    }) => previewHostSessionRecordApply(sessionId, request, context),
  });
}

async function invalidateAppliedRecordSurfaces(
  client: QueryClient,
  sessionId: string,
  context?: ReadmatesApiContext,
  invalidateMemberAndPublicSurfaces?: (event: {
    sessionId: string;
    clubSlug?: string;
  }) => Promise<unknown>,
) {
  await Promise.all([
    client.invalidateQueries({ queryKey: hostSessionRecordKeys.editor(sessionId, context) }),
    client.invalidateQueries({ queryKey: hostSessionRecordKeys.ledgers(context) }),
    client.invalidateQueries({ queryKey: hostSessionRecordKeys.historyRoot(sessionId, context) }),
    invalidateHostSessionDashboard(client, context),
    ...(invalidateMemberAndPublicSurfaces
      ? [invalidateMemberAndPublicSurfaces({
          sessionId,
          clubSlug: context?.clubSlug,
        })]
      : []),
  ]);
}

export function useApplyHostSessionRecordMutation(
  context: ReadmatesApiContext | undefined,
  invalidateMemberAndPublicSurfaces: (event: {
    sessionId: string;
    clubSlug?: string;
  }) => Promise<unknown>,
) {
  const client = useQueryClient();
  return useMutation<
    HostSessionRecordApplyResult,
    Error,
    {
      sessionId: string;
      request: HostSessionRecordApplyRequest;
    }
  >({
    mutationFn: ({ sessionId, request }: {
      sessionId: string;
      request: HostSessionRecordApplyRequest;
    }) => applyHostSessionRecord(sessionId, request, context),
    onSuccess: (_result, variables) =>
      invalidateAppliedRecordSurfaces(
        client,
        variables.sessionId,
        context,
        invalidateMemberAndPublicSurfaces,
      ),
  });
}

export function useRestoreHostSessionRevisionToDraftMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, revisionId, request }: {
      sessionId: string;
      revisionId: string;
      request: RestoreHostSessionRecordDraftRequest;
    }) => restoreHostSessionRevisionToDraft(sessionId, revisionId, request, context),
    onSuccess: (draft, variables) => updateEditorDraft(client, variables.sessionId, context, draft),
  });
}
