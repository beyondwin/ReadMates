import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createAdminSupportGrant,
  fetchAdminSupportGrantLedger,
  revokeAdminSupportGrant,
  searchAdminSupportSubjects,
} from "@/features/platform-admin/api/platform-admin-support-api";
import type { AdminSupportGrantRequest } from "@/features/platform-admin/model/platform-admin-support-model";

export const platformAdminSupportKeys = {
  all: ["platform-admin", "support"] as const,
  search: (query: string, clubId?: string) => [...platformAdminSupportKeys.all, "search", query, clubId ?? null] as const,
  ledger: (filters: { clubId?: string; granteeUserId?: string } = {}) =>
    [...platformAdminSupportKeys.all, "ledger", filters.clubId ?? null, filters.granteeUserId ?? null] as const,
} as const;

export function platformAdminSupportSearchQuery(query: string, clubId?: string) {
  return queryOptions({
    queryKey: platformAdminSupportKeys.search(query, clubId),
    queryFn: () => searchAdminSupportSubjects(query, clubId),
    enabled: query.trim().length > 0,
  });
}

export function platformAdminSupportLedgerQuery(filters: { clubId?: string; granteeUserId?: string } = {}) {
  return queryOptions({
    queryKey: platformAdminSupportKeys.ledger(filters),
    queryFn: () => fetchAdminSupportGrantLedger(filters),
  });
}

export function useCreateAdminSupportGrantMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AdminSupportGrantRequest) => createAdminSupportGrant(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformAdminSupportKeys.all }),
  });
}

export function useRevokeAdminSupportGrantMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (grantId: string) => revokeAdminSupportGrant(grantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformAdminSupportKeys.all }),
  });
}
