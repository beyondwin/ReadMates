import { readmatesFetch } from "@/shared/api/client";
import {
  adminAuditSearchFromFilters,
  type AdminAuditFilters,
  type AdminAuditLedgerPage,
} from "@/features/platform-admin/model/platform-admin-audit-model";

export function fetchAdminAuditLedger(filters: AdminAuditFilters = {}) {
  return readmatesFetch<AdminAuditLedgerPage>(
    `/api/admin/audit/events${adminAuditSearch(filters)}`,
    undefined,
    { clubSlug: undefined },
  );
}

function adminAuditSearch(filters: AdminAuditFilters): string {
  const search = adminAuditSearchFromFilters(filters).toString();
  return search ? `?${search}` : "";
}
