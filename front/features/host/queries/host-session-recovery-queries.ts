import { useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import {
  fetchHostSessionRestorePreview,
  restoreHostSessionChange,
} from "@/features/host/api/host-session-recovery-api";
import type { HostSessionRestoreRequest } from "@/features/host/api/host-session-recovery-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import { hostSessionRecordKeys } from "./host-session-record-queries";
import {
  invalidateHostCurrentSession,
  invalidateHostSessionClosingStatus,
  invalidateHostSessionDashboard,
  invalidateHostSessionDetail,
  invalidateHostSessionLists,
} from "./host-session-queries";

function scopeKey(context?: ReadmatesApiContext) {
  return context?.clubSlug ?? null;
}

export const hostSessionRecoveryKeys = {
  all: ["host", "session-recovery"] as const,
  scope: (context?: ReadmatesApiContext) =>
    [...hostSessionRecoveryKeys.all, scopeKey(context)] as const,
  restorePreviews: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionRecoveryKeys.scope(context), "restore-preview", sessionId] as const,
  restorePreview: (sessionId: string, changeId: string, context?: ReadmatesApiContext) =>
    [...hostSessionRecoveryKeys.restorePreviews(sessionId, context), changeId] as const,
} as const;

export function hostSessionRestorePreviewQuery(
  sessionId: string,
  changeId: string,
  context?: ReadmatesApiContext,
) {
  return queryOptions({
    queryKey: hostSessionRecoveryKeys.restorePreview(sessionId, changeId, context),
    queryFn: () => fetchHostSessionRestorePreview(sessionId, changeId, context),
  });
}

export function useRestoreHostSessionChangeMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      changeId,
      request,
    }: {
      sessionId: string;
      changeId: string;
      request: HostSessionRestoreRequest;
    }) => restoreHostSessionChange(sessionId, changeId, request, context),
    onSuccess: async (_receipt, variables) => {
      await Promise.all([
        invalidateHostSessionDetail(client, variables.sessionId, context),
        invalidateHostSessionClosingStatus(client, variables.sessionId, context),
        invalidateHostSessionLists(client, context),
        invalidateHostSessionDashboard(client, context),
        invalidateHostCurrentSession(client, context),
        client.invalidateQueries({
          queryKey: hostSessionRecordKeys.historyRoot(variables.sessionId, context),
        }),
        client.invalidateQueries({
          queryKey: hostSessionRecoveryKeys.restorePreviews(variables.sessionId, context),
        }),
      ]);
    },
  });
}
