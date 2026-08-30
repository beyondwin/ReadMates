import { infiniteQueryOptions, useMutation, type QueryClient } from "@tanstack/react-query";
import {
  confirmAdminSupportGrant,
  confirmAdminSupportGrantRevoke,
  fetchAdminSupportGrantLedger,
  previewAdminSupportGrant,
  previewAdminSupportGrantRevoke,
  searchAdminSupportSubjects,
} from "@/features/platform-admin/api/platform-admin-support-api";
import type {
  AdminSupportGrantCreateConfirmRequest,
  AdminSupportGrantCreateDraft,
  AdminSupportGrantLedgerFilters,
  AdminSupportGrantRevokeConfirmRequest,
  AdminSupportGrantRevokeDraft,
} from "@/features/platform-admin/model/platform-admin-support-model";

export const platformAdminSupportKeys = {
  all: ["platform-admin", "support"] as const,
  ledgerRoot: () => [...platformAdminSupportKeys.all, "ledger"] as const,
  ledger: (filters: AdminSupportGrantLedgerFilters = {}) => [
    ...platformAdminSupportKeys.ledgerRoot(),
    filters.clubId ?? null,
    filters.status ?? null,
  ] as const,
  searchMutation: () => [...platformAdminSupportKeys.all, "search", "ephemeral"] as const,
  createMutation: () => [...platformAdminSupportKeys.all, "create", "ephemeral"] as const,
  revokeMutation: () => [...platformAdminSupportKeys.all, "revoke", "ephemeral"] as const,
} as const;

export function platformAdminSupportLedgerInfiniteQuery(filters: AdminSupportGrantLedgerFilters = {}) {
  return infiniteQueryOptions({
    queryKey: platformAdminSupportKeys.ledger(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchAdminSupportGrantLedger(filters, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

type PrivateRequest<TResult> = () => Promise<TResult>;

function usePrivateSupportMutation<TResult>(key: readonly unknown[]) {
  return useMutation({
    mutationKey: key,
    gcTime: 0,
    mutationFn: (request: PrivateRequest<TResult>) => request(),
  });
}

export function publishAdminSupportLedger(client: QueryClient) {
  return client.invalidateQueries({ queryKey: platformAdminSupportKeys.ledgerRoot() });
}

export function useAdminSupportSearchMutation() {
  const mutation = usePrivateSupportMutation<Awaited<ReturnType<typeof searchAdminSupportSubjects>>>(
    platformAdminSupportKeys.searchMutation(),
  );
  return {
    ...mutation,
    search: (query: string, clubId?: string) => mutation.mutateAsync(() => searchAdminSupportSubjects(query, clubId)),
  };
}

export function useAdminSupportCreatePreviewMutation() {
  const mutation = usePrivateSupportMutation<Awaited<ReturnType<typeof previewAdminSupportGrant>>>(
    platformAdminSupportKeys.createMutation(),
  );
  return {
    ...mutation,
    preview: (request: AdminSupportGrantCreateDraft) => mutation.mutateAsync(() => previewAdminSupportGrant(request)),
  };
}

export function useAdminSupportCreateConfirmMutation() {
  const mutation = usePrivateSupportMutation<Awaited<ReturnType<typeof confirmAdminSupportGrant>>>(
    platformAdminSupportKeys.createMutation(),
  );
  return {
    ...mutation,
    confirm: (request: AdminSupportGrantCreateConfirmRequest) =>
      mutation.mutateAsync(() => confirmAdminSupportGrant(request)),
  };
}

export function useAdminSupportRevokePreviewMutation() {
  const mutation = usePrivateSupportMutation<Awaited<ReturnType<typeof previewAdminSupportGrantRevoke>>>(
    platformAdminSupportKeys.revokeMutation(),
  );
  return {
    ...mutation,
    preview: (grantId: string, request: AdminSupportGrantRevokeDraft) =>
      mutation.mutateAsync(() => previewAdminSupportGrantRevoke(grantId, request)),
  };
}

export function useAdminSupportRevokeConfirmMutation() {
  const mutation = usePrivateSupportMutation<Awaited<ReturnType<typeof confirmAdminSupportGrantRevoke>>>(
    platformAdminSupportKeys.revokeMutation(),
  );
  return {
    ...mutation,
    confirm: (grantId: string, request: AdminSupportGrantRevokeConfirmRequest) =>
      mutation.mutateAsync(() => confirmAdminSupportGrantRevoke(grantId, request)),
  };
}
