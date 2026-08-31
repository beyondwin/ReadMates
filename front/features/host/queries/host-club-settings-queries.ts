import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  changeHostCoHost,
  confirmHostClubClose,
  fetchHostClubSettings,
  fetchHostClubSettingsHistory,
  previewHostClubClose,
  updateHostClubSettings,
} from "@/features/host/api/host-club-settings-api";
import type { UpdateHostClubSettingsRequest } from "@/features/host/api/host-club-settings-contracts";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import { hostClubQueryPrefix, hostMutationKey } from "./host-state-purge";

export const hostClubSettingsKeys = {
  scope: (context: ExplicitReadmatesApiContext) => [...hostClubQueryPrefix(context.clubSlug), "club-settings"] as const,
  detail: (context: ExplicitReadmatesApiContext) => [...hostClubSettingsKeys.scope(context), "detail"] as const,
  history: (page: PageRequest | undefined, context: ExplicitReadmatesApiContext) => [...hostClubSettingsKeys.scope(context), "history", page ?? {}] as const,
};

export const hostClubSettingsQuery = (context: ExplicitReadmatesApiContext) => queryOptions({ queryKey: hostClubSettingsKeys.detail(context), queryFn: () => fetchHostClubSettings(context) });
export const hostClubSettingsHistoryQuery = (page: PageRequest | undefined, context: ExplicitReadmatesApiContext) => queryOptions({ queryKey: hostClubSettingsKeys.history(page, context), queryFn: () => fetchHostClubSettingsHistory(context, page) });
export const invalidateHostClubSettings = (client: QueryClient, context: ExplicitReadmatesApiContext) => client.invalidateQueries({ queryKey: hostClubSettingsKeys.scope(context) });

export function useUpdateHostClubSettings(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({ mutationKey: hostMutationKey(context.clubSlug, "club-settings", "update"), mutationFn: (request: UpdateHostClubSettingsRequest) => updateHostClubSettings(request, context), onSuccess: () => invalidateHostClubSettings(client, context) });
}

export function useChangeHostCoHost(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({ mutationKey: hostMutationKey(context.clubSlug, "club-settings", "co-host"), mutationFn: ({ membershipId, action, expectedRevision, idempotencyKey }: { membershipId: string; action: "promote" | "demote"; expectedRevision: number; idempotencyKey: string }) => changeHostCoHost(membershipId, action, { expectedRevision, idempotencyKey }, context), onSuccess: () => invalidateHostClubSettings(client, context) });
}

export const usePreviewHostClubClose = (context: ExplicitReadmatesApiContext) => useMutation({ mutationKey: hostMutationKey(context.clubSlug, "club-settings", "end-preview"), mutationFn: () => previewHostClubClose(context) });
export function useConfirmHostClubClose(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({ mutationKey: hostMutationKey(context.clubSlug, "club-settings", "end-confirm"), mutationFn: (request: { previewId: string; effectHash: string; idempotencyKey: string }) => confirmHostClubClose(request, context), onSuccess: () => invalidateHostClubSettings(client, context) });
}
