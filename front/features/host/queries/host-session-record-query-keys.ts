import type { HostSessionLedgerRequest } from "@/features/host/api/host-session-record-contracts";
import { normalizeHostSessionLedgerRequest } from "@/features/host/api/host-session-record-contracts";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import { normalizePageRequest } from "@/shared/query/cursor-pagination";

import { hostClubQueryPrefix } from "./host-state-purge";

export const hostSessionRecordKeys = {
  scope: (context: ExplicitReadmatesApiContext) =>
    [...hostClubQueryPrefix(context.clubSlug), "session-records"] as const,
  capabilities: (context: ExplicitReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "capabilities"] as const,
  ledgers: (context: ExplicitReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "ledger"] as const,
  ledger: (request: HostSessionLedgerRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostSessionRecordKeys.ledgers(context), normalizeHostSessionLedgerRequest(request)] as const,
  attentionPages: (context: ExplicitReadmatesApiContext) =>
    [...hostSessionRecordKeys.ledgers(context), "attention-pages"] as const,
  editor: (sessionId: string, context: ExplicitReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "editor", sessionId] as const,
  historyRoot: (sessionId: string, context: ExplicitReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "history", sessionId] as const,
  history: (sessionId: string, page: PageRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostSessionRecordKeys.historyRoot(sessionId, context), normalizePageRequest(page)] as const,
} as const;
