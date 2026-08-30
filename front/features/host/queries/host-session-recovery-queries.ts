import { useMutation, queryOptions, type QueryClient } from "@tanstack/react-query";
import {
  fetchHostSessionRestorePreview,
  restoreHostSessionChange,
} from "@/features/host/api/host-session-recovery-api";
import { fetchHostSessionDetail } from "@/features/host/api/host-api";
import type { HostSessionRestoreRequest } from "@/features/host/api/host-session-recovery-contracts";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import { hostSessionRecordKeys } from "./host-session-record-queries";
import {
  invalidateHostCurrentSession,
  invalidateHostSessionClosingStatus,
  invalidateHostSessionDashboard,
  invalidateHostSessionDetail,
  invalidateHostSessionLists,
  executeHostMutationWithReconciliation,
} from "./host-session-queries";

import { hostClubQueryPrefix, hostMutationKey } from "./host-state-purge";

export const hostSessionRecoveryKeys = {
  scope: (context: ExplicitReadmatesApiContext) =>
    [...hostClubQueryPrefix(context.clubSlug), "session-recovery"] as const,
  restorePreviews: (sessionId: string, context: ExplicitReadmatesApiContext) =>
    [...hostSessionRecoveryKeys.scope(context), "restore-preview", sessionId] as const,
  restorePreview: (sessionId: string, changeId: string, context: ExplicitReadmatesApiContext) =>
    [...hostSessionRecoveryKeys.restorePreviews(sessionId, context), changeId] as const,
} as const;

export function hostSessionRestorePreviewQuery(
  sessionId: string,
  changeId: string,
  context: ExplicitReadmatesApiContext,
) {
  return queryOptions({
    queryKey: hostSessionRecoveryKeys.restorePreview(sessionId, changeId, context),
    queryFn: () => fetchHostSessionRestorePreview(sessionId, changeId, context),
  });
}

export function useRestoreHostSessionChangeMutation(context: ExplicitReadmatesApiContext) {
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "session-recovery", "restore"),
    mutationFn: ({
      sessionId,
      changeId,
      request,
    }: {
      sessionId: string;
      changeId: string;
      request: HostSessionRestoreRequest;
    }) => {
      const explicitContext = context;
      return fetchHostSessionDetail(sessionId, explicitContext).then((detail) => {
        const envelope = {
          idempotencyKey: `host-${globalThis.crypto.randomUUID()}`,
          expected: { sessionRevision: detail.versions.sessionRevision },
          command: request,
        };
        return executeHostMutationWithReconciliation({
          operation: "SESSION_RESTORE",
          resourceSlot: changeId,
          envelope,
          context: explicitContext,
          execute: (exactEnvelope) => restoreHostSessionChange(
            sessionId,
            changeId,
            exactEnvelope,
            explicitContext,
          ),
          acceptCommitted: async (reconciliation) => ({
              changeId: reconciliation.receipt?.receiptId ?? changeId,
              kind: "BASIC_INFO" as const,
              undoAvailable: true as const,
            }),
        });
      });
    },
  });
}

export async function publishRestoredHostSessionChange(client: QueryClient, sessionId: string, context: ExplicitReadmatesApiContext) {
      await Promise.all([
        invalidateHostSessionDetail(client, sessionId, context),
        invalidateHostSessionClosingStatus(client, sessionId, context),
        invalidateHostSessionLists(client, context),
        invalidateHostSessionDashboard(client, context),
        invalidateHostCurrentSession(client, context),
        client.invalidateQueries({
          queryKey: hostSessionRecordKeys.historyRoot(sessionId, context),
        }),
        client.invalidateQueries({
          queryKey: hostSessionRecordKeys.editor(sessionId, context),
          exact: true,
        }),
        client.invalidateQueries({ queryKey: hostSessionRecordKeys.ledgers(context) }),
        client.invalidateQueries({
          queryKey: hostSessionRecoveryKeys.restorePreviews(sessionId, context),
        }),
      ]);
}
