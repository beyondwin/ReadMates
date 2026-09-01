import { readmatesFetch } from "@/shared/api/client";
import type {
  AdminSupportGrantCreateConfirmRequest,
  AdminSupportGrantCreateDraft,
  AdminSupportGrantLedgerFilters,
  AdminSupportGrantLedgerPage,
  AdminSupportGrantRevokeConfirmRequest,
  AdminSupportGrantRevokeDraft,
  AdminSupportSearchResult,
} from "@/features/platform-admin/model/platform-admin-support-model";
import {
  parseAdminSupportGrantPreview,
  parseAdminSupportGrantReceipt,
} from "./platform-admin-support-contracts";

const ADMIN_CONTEXT = { clubSlug: undefined } as const;

export function searchAdminSupportSubjects(query: string, clubId?: string) {
  return readmatesFetch<AdminSupportSearchResult[]>(
    "/api/admin/support/search",
    { method: "POST", body: JSON.stringify({ query, ...(clubId ? { clubId } : {}) }) },
    ADMIN_CONTEXT,
  );
}

export function fetchAdminSupportGrantLedger(
  filters: AdminSupportGrantLedgerFilters = {},
  cursor?: string,
) {
  const params = new URLSearchParams();
  if (filters.clubId) params.set("clubId", filters.clubId);
  if (filters.status) params.set("status", filters.status);
  if (cursor) params.set("cursor", cursor);
  const search = params.toString();
  return readmatesFetch<AdminSupportGrantLedgerPage>(
    `/api/admin/support/grants${search ? `?${search}` : ""}`,
    undefined,
    ADMIN_CONTEXT,
  );
}

export function previewAdminSupportGrant(request: AdminSupportGrantCreateDraft) {
  return readmatesFetch<unknown>(
    "/api/admin/support/grants/preview",
    { method: "POST", body: JSON.stringify(request) },
    ADMIN_CONTEXT,
  ).then(parseAdminSupportGrantPreview);
}

export function confirmAdminSupportGrant(request: AdminSupportGrantCreateConfirmRequest) {
  return readmatesFetch<unknown>(
    "/api/admin/support/grants/confirm",
    { method: "POST", body: JSON.stringify(request) },
    ADMIN_CONTEXT,
  ).then(parseAdminSupportGrantReceipt);
}

export function previewAdminSupportGrantRevoke(grantId: string, request: AdminSupportGrantRevokeDraft) {
  return readmatesFetch<unknown>(
    `/api/admin/support/grants/${encodeURIComponent(grantId)}/revoke/preview`,
    { method: "POST", body: JSON.stringify(request) },
    ADMIN_CONTEXT,
  ).then(parseAdminSupportGrantPreview);
}

export function confirmAdminSupportGrantRevoke(
  grantId: string,
  request: AdminSupportGrantRevokeConfirmRequest,
) {
  return readmatesFetch<unknown>(
    `/api/admin/support/grants/${encodeURIComponent(grantId)}/revoke/confirm`,
    { method: "POST", body: JSON.stringify(request) },
    ADMIN_CONTEXT,
  ).then(parseAdminSupportGrantReceipt);
}
