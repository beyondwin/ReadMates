import { queryOptions } from "@tanstack/react-query";
import { fetchAdminAuditLedger } from "@/features/platform-admin/api/platform-admin-audit-api";
import type { AdminAuditFilters } from "@/features/platform-admin/model/platform-admin-audit-model";

function normalizeFilters(filters: AdminAuditFilters = {}) {
  return {
    range: filters.range ?? "7d",
    from: filters.from ?? null,
    to: filters.to ?? null,
    clubId: filters.clubId ?? null,
    actorRole: filters.actorRole ?? null,
    sourceSlice: filters.sourceSlice ?? null,
    actionCategory: filters.actionCategory ?? null,
    outcome: filters.outcome ?? null,
    cursor: filters.cursor ?? null,
  };
}

export const platformAdminAuditKeys = {
  all: ["platform-admin", "audit"] as const,
  ledger: (filters?: AdminAuditFilters) => [...platformAdminAuditKeys.all, "ledger", normalizeFilters(filters)] as const,
} as const;

export function platformAdminAuditLedgerQuery(filters?: AdminAuditFilters) {
  return queryOptions({
    queryKey: platformAdminAuditKeys.ledger(filters),
    queryFn: () => fetchAdminAuditLedger(filters),
  });
}
