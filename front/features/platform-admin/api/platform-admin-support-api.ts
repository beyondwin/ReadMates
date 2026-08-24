import { readmatesFetch } from "@/shared/api/client";
import type {
  AdminSupportGrantCreateConfirmRequest,
  AdminSupportGrantCreateDraft,
  AdminSupportGrantLedgerFilters,
  AdminSupportGrantLedgerPage,
  AdminSupportGrantPreview,
  AdminSupportGrantReceipt,
  AdminSupportGrantRevokeConfirmRequest,
  AdminSupportGrantRevokeDraft,
  AdminSupportSearchResult,
} from "@/features/platform-admin/model/platform-admin-support-model";

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
  return readmatesFetch<AdminSupportGrantPreview>(
    "/api/admin/support/grants/preview",
    { method: "POST", body: JSON.stringify(request) },
    ADMIN_CONTEXT,
  );
}

export function confirmAdminSupportGrant(request: AdminSupportGrantCreateConfirmRequest) {
  return readmatesFetch<AdminSupportGrantReceipt>(
    "/api/admin/support/grants/confirm",
    { method: "POST", body: JSON.stringify(request) },
    ADMIN_CONTEXT,
  );
}

export function previewAdminSupportGrantRevoke(grantId: string, request: AdminSupportGrantRevokeDraft) {
  return readmatesFetch<AdminSupportGrantPreview>(
    `/api/admin/support/grants/${encodeURIComponent(grantId)}/revoke/preview`,
    { method: "POST", body: JSON.stringify(request) },
    ADMIN_CONTEXT,
  );
}

export function confirmAdminSupportGrantRevoke(
  grantId: string,
  request: AdminSupportGrantRevokeConfirmRequest,
) {
  return readmatesFetch<AdminSupportGrantReceipt>(
    `/api/admin/support/grants/${encodeURIComponent(grantId)}/revoke/confirm`,
    { method: "POST", body: JSON.stringify(request) },
    ADMIN_CONTEXT,
  );
}
