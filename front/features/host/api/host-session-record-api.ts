import { readmatesFetch, readmatesFetchResponse, type ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import type { HostSessionListPage } from "./host-contracts";
import {
  HostSessionRecordLedgerPageResponseSchema,
  parseHostSessionHistoryPage,
  parseHostSessionRecordApplyPreview,
  parseHostSessionRecordApplyResult,
  parseHostSessionRecordCapabilities,
  parseHostSessionRecordDraft,
  parseHostSessionRecordEditor,
  type HostSessionHistoryPage,
  type HostSessionLedgerRequest,
  type HostSessionRecordApplyPreview,
  type HostSessionRecordApplyRequest,
  type HostSessionRecordApplyResult,
  type HostSessionRecordCapabilities,
  type HostSessionRecordDraft,
  type HostSessionRecordEditor,
  type PreviewHostSessionRecordApplyRequest,
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
  const params = new URLSearchParams();
  const search = request?.search?.trim();
  if (search) {
    params.set("search", search);
  }
  if (request?.state) {
    params.set("state", request.state);
  }
  if (request?.recordStatus) {
    params.set("recordStatus", request.recordStatus);
  }
  if (request?.needsAttention !== null && request?.needsAttention !== undefined) {
    params.set("needsAttention", String(request.needsAttention));
  }
  appendPage(params, request?.page);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function historySearch(page?: PageRequest) {
  const params = new URLSearchParams();
  appendPage(params, page);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function fetchHostSessionRecordCapabilities(context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionRecordCapabilities>("/api/host/capabilities", undefined, context)
    .then(parseHostSessionRecordCapabilities);
}

export function fetchHostSessionRecordLedger(
  request?: HostSessionLedgerRequest,
  context?: ReadmatesApiContext,
) {
  return readmatesFetch<HostSessionListPage>(`/api/host/sessions${ledgerSearch(request)}`, undefined, context)
    .then((value) => HostSessionRecordLedgerPageResponseSchema.parse(value) as HostSessionListPage);
}

export function fetchHostSessionRecordEditor(sessionId: string, context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionRecordEditor>(
    sessionRecordPath(sessionId, "record-editor"),
    undefined,
    context,
  ).then(parseHostSessionRecordEditor);
}

export function saveHostSessionRecordDraft(
  sessionId: string,
  request: SaveHostSessionRecordDraftRequest,
  context?: ReadmatesApiContext,
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

export function deleteHostSessionRecordDraft(
  sessionId: string,
  expectedDraftRevision: number,
  context?: ReadmatesApiContext,
) {
  const params = new URLSearchParams({ expectedDraftRevision: String(expectedDraftRevision) });
  return readmatesFetchResponse(
    `${sessionRecordPath(sessionId, "record-draft")}?${params.toString()}`,
    { method: "DELETE" },
    context,
  ).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to delete session record draft (${response.status})`);
    }
    return response;
  });
}

export function previewHostSessionRecordApply(
  sessionId: string,
  request: PreviewHostSessionRecordApplyRequest,
  context?: ReadmatesApiContext,
) {
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
  request: HostSessionRecordApplyRequest,
  context?: ReadmatesApiContext,
) {
  return readmatesFetch<HostSessionRecordApplyResult>(
    sessionRecordPath(sessionId, "record-apply"),
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    context,
  ).then(parseHostSessionRecordApplyResult);
}

export function fetchHostSessionHistory(
  sessionId: string,
  page?: PageRequest,
  context?: ReadmatesApiContext,
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
  context?: ReadmatesApiContext,
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
