import { readmatesFetch } from "@/shared/api/client";
import {
  adminAuditSearchFromFilters,
  type AdminAuditFilters,
  type AdminAuditLedgerPage,
} from "@/features/platform-admin/model/platform-admin-audit-model";

const ADMIN_CONTEXT = { clubSlug: undefined } as const;

export function fetchAdminAuditLedger(filters: AdminAuditFilters = {}, cursor?: string) {
  return readmatesFetch<AdminAuditLedgerPage>(
    `/api/admin/audit/events${adminAuditSearch(filters, cursor)}`,
    undefined,
    ADMIN_CONTEXT,
  );
}

export function searchAdminAuditLedger(
  filters: AdminAuditFilters,
  sensitiveTarget: string,
  cursor?: string,
) {
  const body = Object.fromEntries(
    Object.entries({ ...filters, sensitiveTarget, cursor }).filter(([, value]) => value !== null && value !== undefined),
  );
  return readmatesFetch<AdminAuditLedgerPage>(
    "/api/admin/audit/events/search",
    { method: "POST", body: JSON.stringify(body) },
    ADMIN_CONTEXT,
  );
}

function adminAuditSearch(filters: AdminAuditFilters, cursor?: string): string {
  const params = adminAuditSearchFromFilters(filters);
  if (cursor) params.set("cursor", cursor);
  const search = params.toString();
  return search ? `?${search}` : "";
}
