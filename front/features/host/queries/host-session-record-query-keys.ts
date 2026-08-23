import type { HostSessionLedgerRequest } from "@/features/host/api/host-session-record-contracts";
import { normalizeHostSessionLedgerRequest } from "@/features/host/api/host-session-record-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import { normalizePageRequest } from "@/shared/query/cursor-pagination";

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
  attentionPages: (context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.ledgers(context), "attention-pages"] as const,
  editor: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "editor", sessionId] as const,
  historyRoot: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "history", sessionId] as const,
  history: (sessionId: string, page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.historyRoot(sessionId, context), normalizePageRequest(page)] as const,
} as const;
