import type { QueryClient } from "@tanstack/react-query";
import { infiniteQueryOptions, queryOptions, useMutation } from "@tanstack/react-query";
import {
  applyHostSessionRecord,
  deleteHostSessionRecordDraft,
  fetchHostSessionHistory,
  fetchHostSessionRecordCapabilities,
  fetchHostSessionRecordEditor,
  fetchHostSessionRecordLedger,
  previewHostSessionRecordApply,
  rebaseHostSessionRecordDraft,
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
  RebaseHostSessionRecordDraftRequest,
  RestoreHostSessionRecordDraftRequest,
  SaveHostSessionRecordDraftRequest,
} from "@/features/host/api/host-session-record-contracts";
import { normalizeHostSessionLedgerRequest } from "@/features/host/api/host-session-record-contracts";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import { recordHostAttentionResult } from "@/shared/observability/frontend-observability";
import {
  executeHostMutationWithReconciliation,
  HostMutationContextRequiredError,
  invalidateHostSessionDashboard,
} from "./host-session-queries";
import { hostSessionRecordKeys } from "./host-session-record-query-keys";
import { hostMutationKey } from "./host-state-purge";

export { hostSessionRecordKeys } from "./host-session-record-query-keys";

export function hostSessionRecordCapabilitiesQuery(context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: hostSessionRecordKeys.capabilities(context),
    queryFn: () => fetchHostSessionRecordCapabilities(context),
  });
}

export const HOST_OPERATIONS_ATTENTION_PAGE_LIMIT = 20;

export function hostSessionRecordLedgerQuery(
  request: HostSessionLedgerRequest | undefined,
  context: ExplicitReadmatesApiContext,
) {
  const normalizedRequest = normalizeHostSessionLedgerRequest(request);
  return queryOptions({
    queryKey: hostSessionRecordKeys.ledger(normalizedRequest, context),
    queryFn: () => fetchHostSessionRecordLedger(normalizedRequest, context),
  });
}

export function hostSessionRecordAttentionPagesQuery(context: ExplicitReadmatesApiContext) {
  return infiniteQueryOptions({
    queryKey: hostSessionRecordKeys.attentionPages(context),
    queryFn: async ({ pageParam }) => {
      const page = await fetchHostSessionRecordLedger({
        needsAttention: true,
        page: {
          limit: HOST_OPERATIONS_ATTENTION_PAGE_LIMIT,
          cursor: pageParam,
        },
      }, context);
      recordHostAttentionResult({ size: page.items.length });
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: false,
  });
}

export function hostSessionRecordEditorQuery(sessionId: string, context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: hostSessionRecordKeys.editor(sessionId, context),
    queryFn: () => fetchHostSessionRecordEditor(sessionId, context),
  });
}

export function hostSessionRecordHistoryQuery(
  sessionId: string,
  page: PageRequest | undefined,
  context: ExplicitReadmatesApiContext,
) {
  return queryOptions({
    queryKey: hostSessionRecordKeys.history(sessionId, page, context),
    queryFn: () => fetchHostSessionHistory(sessionId, page, context),
  });
}

function updateEditorDraft(
  client: QueryClient,
  sessionId: string,
  context: ExplicitReadmatesApiContext,
  draft: HostSessionRecordDraft | null,
  preserveExistingStaleness = false,
) {
  client.setQueryData<HostSessionRecordEditor>(
    hostSessionRecordKeys.editor(sessionId, context),
    (editor) => {
      if (!editor) {
        return editor;
      }
      const draftLiveBaseStale = draft
        ? (preserveExistingStaleness && editor.draftLiveBaseStale)
          || draft.baseLiveRevision !== editor.liveRevision
        : false;
      return {
        ...editor,
        draft,
        draftLiveBaseStale,
        validationSummary: draftLiveBaseStale
          ? { valid: false, issues: ["LIVE_REVISION_STALE"] }
          : { valid: true, issues: [] },
      };
    },
  );
}

function invalidateRecordDraftLedgerProjection(
  client: QueryClient,
  context: ExplicitReadmatesApiContext,
) {
  return client.invalidateQueries({ queryKey: hostSessionRecordKeys.ledgers(context) });
}

export function useSaveHostSessionRecordDraftMutation(context: ExplicitReadmatesApiContext) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "records", "save-draft"),
    mutationFn: ({ sessionId, request }: {
      sessionId: string;
      request: SaveHostSessionRecordDraftRequest;
    }) => saveHostSessionRecordDraft(sessionId, request, context),
  });
}

export async function publishSavedHostSessionRecordDraft(client: QueryClient, sessionId: string, context: ExplicitReadmatesApiContext, draft: HostSessionRecordDraft) {
  updateEditorDraft(client, sessionId, context, draft, true);
  await invalidateRecordDraftLedgerProjection(client, context);
}

export function useRebaseHostSessionRecordDraftMutation(context: ExplicitReadmatesApiContext) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "records", "rebase-draft"),
    mutationFn: ({ sessionId, request }: {
      sessionId: string;
      request: RebaseHostSessionRecordDraftRequest;
    }) => rebaseHostSessionRecordDraft(sessionId, request, context),
  });
}

export async function publishRebasedHostSessionRecordDraft(client: QueryClient, sessionId: string, request: RebaseHostSessionRecordDraftRequest, context: ExplicitReadmatesApiContext, draft: HostSessionRecordDraft) {
      const editorKey = hostSessionRecordKeys.editor(sessionId, context);
      let cacheAdvanced = false;
      client.setQueryData<HostSessionRecordEditor>(
        editorKey,
        (editor) => {
          if (!editor) {
            return editor;
          }
          const liveStillMatches =
            editor.liveRevision === request.expectedLiveRevision
            && editor.liveSessionUpdatedAt === request.expectedSessionUpdatedAt;
          const cachedDraftRevision = editor.draft?.draftRevision ?? null;
          const draftStateStillMatches =
            cachedDraftRevision === request.expectedDraftRevision
            || cachedDraftRevision === draft.draftRevision;
          if (!liveStillMatches || !draftStateStillMatches) {
            cacheAdvanced = true;
            return {
              ...editor,
              draft: cachedDraftRevision === request.expectedDraftRevision
                ? draft
                : editor.draft,
              draftLiveBaseStale: true,
              validationSummary: { valid: false, issues: ["LIVE_REVISION_STALE"] },
            };
          }
          return {
            ...editor,
            draft,
            draftLiveBaseStale: false,
            validationSummary: { valid: true, issues: [] },
          };
        },
      );
      await Promise.all([
        ...(cacheAdvanced ? [client.invalidateQueries({ queryKey: editorKey, exact: true })] : []),
        invalidateRecordDraftLedgerProjection(client, context),
      ]);
}

export function useDeleteHostSessionRecordDraftMutation(context: ExplicitReadmatesApiContext) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "records", "delete-draft"),
    mutationFn: ({ sessionId, expectedDraftRevision }: {
      sessionId: string;
      expectedDraftRevision: number;
    }) => deleteHostSessionRecordDraft(sessionId, expectedDraftRevision, context),
  });
}

export async function publishDeletedHostSessionRecordDraft(client: QueryClient, sessionId: string, context: ExplicitReadmatesApiContext) {
  updateEditorDraft(client, sessionId, context, null);
  await invalidateRecordDraftLedgerProjection(client, context);
}

export function usePreviewHostSessionRecordApplyMutation(context: ExplicitReadmatesApiContext) {
  return useMutation<
    HostSessionRecordApplyPreview,
    Error,
    {
      sessionId: string;
      request: PreviewHostSessionRecordApplyRequest;
    }
  >({
    mutationKey: hostMutationKey(context.clubSlug, "records", "preview-apply"),
    mutationFn: ({ sessionId, request }: {
      sessionId: string;
      request: PreviewHostSessionRecordApplyRequest;
    }) => previewHostSessionRecordApply(sessionId, request, context),
  });
}

async function invalidateAppliedRecordSurfaces(
  client: QueryClient,
  sessionId: string,
  context: ExplicitReadmatesApiContext,
  invalidateMemberAndPublicSurfaces?: (event: {
    sessionId: string;
    clubSlug: string;
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
          clubSlug: context.clubSlug,
        })]
      : []),
  ]);
}

export function useApplyHostSessionRecordMutation(
  context: ExplicitReadmatesApiContext,
  invalidateMemberAndPublicSurfaces: (event: {
    sessionId: string;
    clubSlug: string;
  }) => Promise<unknown>,
) {
  void invalidateMemberAndPublicSurfaces;
  return useMutation<
    HostSessionRecordApplyResult,
    Error,
    {
      sessionId: string;
      request: HostSessionRecordApplyRequest;
    }
  >({
    mutationKey: context?.clubSlug
      ? hostMutationKey(context.clubSlug, "records", "apply")
      : ["host-mutation-context-required", "records", "apply"],
    mutationFn: ({ sessionId, request }: {
      sessionId: string;
      request: HostSessionRecordApplyRequest;
    }) => {
      if (!context?.clubSlug) {
        throw new HostMutationContextRequiredError();
      }
      const explicitContext = { clubSlug: context.clubSlug };
      const envelope = {
        idempotencyKey: `host-${globalThis.crypto.randomUUID()}`,
        expected: {
          draftRevision: request.expectedDraftRevision,
          liveRevision: request.expectedLiveRevision,
        },
        command: {
          applyRequestId: request.applyRequestId,
          expectedDraftHash: request.expectedDraftHash,
        },
      };
      return executeHostMutationWithReconciliation({
        operation: "SESSION_RECORD_APPLY",
        resourceSlot: sessionId,
        envelope,
        context: explicitContext,
        execute: (exactEnvelope) => applyHostSessionRecord(sessionId, exactEnvelope, explicitContext),
        acceptCommitted: async (reconciliation) => {
          if (!reconciliation.receipt) {
            throw new Error("HOST_MUTATION_COMMITTED_RECEIPT_MISSING");
          }
          const history = await fetchHostSessionHistory(
            sessionId,
            { limit: 20 },
            explicitContext,
          );
          const revisionId = history.items.find((item) => item.revisionId !== null)?.revisionId;
          if (!revisionId) {
            throw new Error("HOST_RECORD_APPLY_COMMITTED_STATE_MISSING");
          }
          return {
            revisionId,
            liveRevision: reconciliation.receipt.resultingVersions.liveRecordRevision
              ?? request.expectedLiveRevision + 1,
            composer: null,
          };
        },
      });
    },
  });
}

export function publishAppliedHostSessionRecord(client: QueryClient, sessionId: string, context: ExplicitReadmatesApiContext, invalidateMemberAndPublicSurfaces: (event: { sessionId: string; clubSlug: string }) => Promise<unknown>) {
  return invalidateAppliedRecordSurfaces(client, sessionId, context, invalidateMemberAndPublicSurfaces);
}

export function useRestoreHostSessionRevisionToDraftMutation(context: ExplicitReadmatesApiContext) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "records", "restore-revision"),
    mutationFn: ({ sessionId, revisionId, request }: {
      sessionId: string;
      revisionId: string;
      request: RestoreHostSessionRecordDraftRequest;
    }) => restoreHostSessionRevisionToDraft(sessionId, revisionId, request, context),
  });
}


export async function publishRestoredHostSessionRevisionDraft(client: QueryClient, sessionId: string, context: ExplicitReadmatesApiContext, draft: HostSessionRecordDraft) {
  updateEditorDraft(client, sessionId, context, draft);
  await invalidateRecordDraftLedgerProjection(client, context);
}
