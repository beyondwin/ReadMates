import {
  readmatesFetch,
  readmatesFetchResponse,
  type ExplicitReadmatesApiContext,
} from "@/shared/api/client";
import {
  completeHostResponseBody,
  hostApiErrorFromResponse,
} from "@/shared/api/host-authority-event";
import type { PageRequest } from "@/shared/model/paging";
import type { HostSessionRecordLedgerPage } from "./host-contracts";
import {
  HostSessionRecordLedgerPageResponseSchema,
  normalizeHostSessionLedgerRequest,
  parseHostSessionHistoryPage,
  parseHostSessionRecordApplyPreview,
  parseHostSessionRecordApplyResult,
  parseHostSessionRecordCapabilities,
  parseHostSessionRecordDraft,
  parseHostSessionRecordEditor,
  HostSessionRecordApplyMutationEnvelopeSchema,
  type HostSessionHistoryPage,
  type HostSessionLedgerRequest,
  type HostSessionRecordApplyPreview,
  type HostSessionRecordApplyMutationEnvelope,
  type HostSessionRecordApplyResult,
  type HostSessionRecordCapabilities,
  type HostSessionRecordDraft,
  type HostSessionRecordEditor,
  type PreviewHostSessionRecordApplyRequest,
  type RebaseHostSessionRecordDraftRequest,
  type RestoreHostSessionRecordDraftRequest,
  type SaveHostSessionRecordDraftRequest,
} from "./host-session-record-contracts";

function sessionRecordPath(sessionId: string, suffix: string) {
  return `/api/host/sessions/${encodeURIComponent(sessionId)}/${suffix}`;
}

function appendPage(params: URLSearchParams, page?: PageRequest) {
  if (page?.limit !== undefined) {
    params.set("limit", String(page.limit));
  }
  if (page?.cursor) {
    params.set("cursor", page.cursor);
  }
}

function ledgerSearch(request?: HostSessionLedgerRequest) {
  const normalized = normalizeHostSessionLedgerRequest(request);
  const params = new URLSearchParams({ mode: "record" });
  const search = normalized.search;
  if (search) {
    params.set("search", search);
  }
  if (normalized.recordStatus) {
    params.set("recordStatus", normalized.recordStatus);
  }
  if (normalized.needsAttention !== null && normalized.needsAttention !== undefined) {
    params.set("needsAttention", String(normalized.needsAttention));
  }
  appendPage(params, normalized.page);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function historySearch(page?: PageRequest) {
  const params = new URLSearchParams();
  appendPage(params, page);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function fetchHostSessionRecordCapabilities(context: ExplicitReadmatesApiContext) {
  return readmatesFetch<HostSessionRecordCapabilities>("/api/host/capabilities", undefined, context)
    .then(parseHostSessionRecordCapabilities);
}

export function fetchHostSessionRecordLedger(
  request: HostSessionLedgerRequest | undefined,
  context: ExplicitReadmatesApiContext,
) {
  return readmatesFetch<HostSessionRecordLedgerPage>(
    `/api/host/sessions${ledgerSearch(request)}`,
    undefined,
    context,
  ).then((value) => HostSessionRecordLedgerPageResponseSchema.parse(value) as HostSessionRecordLedgerPage);
}

export function fetchHostSessionRecordEditor(sessionId: string, context: ExplicitReadmatesApiContext) {
  return readmatesFetch<HostSessionRecordEditor>(
    sessionRecordPath(sessionId, "record-editor"),
    undefined,
    context,
  ).then(parseHostSessionRecordEditor);
}

export function saveHostSessionRecordDraft(
  sessionId: string,
  request: SaveHostSessionRecordDraftRequest,
  context: ExplicitReadmatesApiContext,
) {
  return readmatesFetch<HostSessionRecordDraft>(
    sessionRecordPath(sessionId, "record-draft"),
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
    context,
  ).then(parseHostSessionRecordDraft);
}

export function rebaseHostSessionRecordDraft(
  sessionId: string,
  request: RebaseHostSessionRecordDraftRequest,
  context: ExplicitReadmatesApiContext,
) {
  return readmatesFetch<HostSessionRecordDraft>(
    sessionRecordPath(sessionId, "record-draft/rebase"),
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    context,
  ).then(parseHostSessionRecordDraft);
}

export function deleteHostSessionRecordDraft(
  sessionId: string,
  expectedDraftRevision: number,
  context: ExplicitReadmatesApiContext,
) {
  const params = new URLSearchParams({ expectedDraftRevision: String(expectedDraftRevision) });
  return readmatesFetchResponse(
    `${sessionRecordPath(sessionId, "record-draft")}?${params.toString()}`,
    { method: "DELETE" },
    context,
  ).then(async (response) => {
    if (!response.ok) {
      throw await hostApiErrorFromResponse(response, {
        clubSlug: context.clubSlug,
        requestKind: "SESSION_RECORD_DRAFT_DELETE",
      });
    }
    return completeHostResponseBody(response);
  });
}

export function previewHostSessionRecordApply(
  sessionId: string,
  request: PreviewHostSessionRecordApplyRequest,
  context: ExplicitReadmatesApiContext,
): Promise<HostSessionRecordApplyPreview> {
  return readmatesFetch<HostSessionRecordApplyPreview>(
    sessionRecordPath(sessionId, "record-apply-preview"),
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    context,
  ).then(parseHostSessionRecordApplyPreview);
}

export function applyHostSessionRecord(
  sessionId: string,
  request: HostSessionRecordApplyMutationEnvelope,
  context: ExplicitReadmatesApiContext,
): Promise<HostSessionRecordApplyResult> {
  return readmatesFetch<HostSessionRecordApplyResult>(
    sessionRecordPath(sessionId, "record-apply"),
    {
      method: "POST",
      body: JSON.stringify(HostSessionRecordApplyMutationEnvelopeSchema.parse(request)),
    },
    context,
  ).then(parseHostSessionRecordApplyResult);
}

export function fetchHostSessionHistory(
  sessionId: string,
  page: PageRequest | undefined,
  context: ExplicitReadmatesApiContext,
) {
  return readmatesFetch<HostSessionHistoryPage>(
    `${sessionRecordPath(sessionId, "history")}${historySearch(page)}`,
    undefined,
    context,
  ).then(parseHostSessionHistoryPage);
}

export function restoreHostSessionRevisionToDraft(
  sessionId: string,
  revisionId: string,
  request: RestoreHostSessionRecordDraftRequest,
  context: ExplicitReadmatesApiContext,
) {
  return readmatesFetch<HostSessionRecordDraft>(
    sessionRecordPath(
      sessionId,
      `revisions/${encodeURIComponent(revisionId)}/restore-to-draft`,
    ),
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    context,
  ).then(parseHostSessionRecordDraft);
}
