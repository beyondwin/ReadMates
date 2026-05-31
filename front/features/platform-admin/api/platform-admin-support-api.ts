import { readmatesFetch } from "@/shared/api/client";
import type { SupportAccessGrantResponse } from "@/features/platform-admin/api/platform-admin-contracts";
import type {
  AdminSupportGrantLedgerItem,
  AdminSupportGrantRequest,
  AdminSupportSearchResult,
} from "@/features/platform-admin/model/platform-admin-support-model";

export function searchAdminSupportSubjects(query: string, clubId?: string) {
  const params = new URLSearchParams({ query });
  if (clubId) params.set("clubId", clubId);
  return readmatesFetch<AdminSupportSearchResult[]>(
    `/api/admin/support/search?${params.toString()}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function fetchAdminSupportGrantLedger(filters: { clubId?: string; granteeUserId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.clubId) params.set("clubId", filters.clubId);
  if (filters.granteeUserId) params.set("granteeUserId", filters.granteeUserId);
  const search = params.toString();
  return readmatesFetch<AdminSupportGrantLedgerItem[]>(
    `/api/admin/support/grants${search ? `?${search}` : ""}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function createAdminSupportGrant(request: AdminSupportGrantRequest) {
  return readmatesFetch<SupportAccessGrantResponse>(
    "/api/admin/support/grants",
    { method: "POST", body: JSON.stringify(request) },
    { clubSlug: undefined },
  );
}

export function revokeAdminSupportGrant(grantId: string) {
  return readmatesFetch<void>(
    `/api/admin/support/grants/${encodeURIComponent(grantId)}`,
    { method: "DELETE" },
    { clubSlug: undefined },
  );
}
