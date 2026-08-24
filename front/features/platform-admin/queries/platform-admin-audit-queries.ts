import { infiniteQueryOptions } from "@tanstack/react-query";
import { fetchAdminAuditLedger, searchAdminAuditLedger } from "@/features/platform-admin/api/platform-admin-audit-api";
import type {
  AdminAuditFilters,
  AdminAuditLedgerPage,
} from "@/features/platform-admin/model/platform-admin-audit-model";

type AdminAuditContinuation = {
  cursor: string;
  from: string;
  to: string;
};

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
  };
}

export const platformAdminAuditKeys = {
  all: ["platform-admin", "audit"] as const,
  ledger: (filters?: AdminAuditFilters) => [...platformAdminAuditKeys.all, "ledger", normalizeFilters(filters)] as const,
  sensitive: (filters: AdminAuditFilters, requestSequence: number) =>
    [...platformAdminAuditKeys.all, "sensitive", normalizeFilters(filters), requestSequence] as const,
} as const;

export function platformAdminAuditLedgerInfiniteQuery(filters: AdminAuditFilters = {}) {
  return infiniteQueryOptions({
    queryKey: platformAdminAuditKeys.ledger(filters),
    initialPageParam: undefined as AdminAuditContinuation | undefined,
    queryFn: ({ pageParam }) =>
      fetchAdminAuditLedger(filtersForContinuation(filters, pageParam), pageParam?.cursor),
    getNextPageParam: continuationFromPage,
  });
}

export function platformAdminAuditSensitiveInfiniteQuery(
  filters: AdminAuditFilters,
  request: { requestSequence: number; sensitiveTarget: string },
) {
  return infiniteQueryOptions({
    queryKey: platformAdminAuditKeys.sensitive(filters, request.requestSequence),
    initialPageParam: undefined as AdminAuditContinuation | undefined,
    queryFn: ({ pageParam }) =>
      searchAdminAuditLedger(filtersForContinuation(filters, pageParam), request.sensitiveTarget, pageParam?.cursor),
    getNextPageParam: continuationFromPage,
    gcTime: 0,
  });
}

function continuationFromPage(
  lastPage: AdminAuditLedgerPage,
  pages: AdminAuditLedgerPage[],
): AdminAuditContinuation | undefined {
  if (!lastPage.nextCursor) return undefined;

  const firstPage = pages[0];
  const from = firstPage?.filters.from;
  const to = firstPage?.filters.to;
  if (typeof from !== "string" || typeof to !== "string") {
    throw new Error("Audit continuation requires normalized first-page time bounds");
  }

  return { cursor: lastPage.nextCursor, from, to };
}

function filtersForContinuation(
  filters: AdminAuditFilters,
  continuation: AdminAuditContinuation | undefined,
): AdminAuditFilters {
  if (!continuation) return filters;
  return { ...filters, from: continuation.from, to: continuation.to };
}
