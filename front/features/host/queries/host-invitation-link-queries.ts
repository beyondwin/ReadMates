import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createHostInvitationLink,
  fetchHostInvitationLinkHistory,
  fetchHostInvitationLinks,
  updateHostInvitationLink,
} from "@/features/host/api/host-invitation-link-api";
import type { CreateHostInvitationLinkRequest, UpdateHostInvitationLinkRequest } from "@/features/host/api/host-invitation-link-contracts";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import { hostClubQueryPrefix, hostMutationKey } from "./host-state-purge";

export const hostInvitationLinkKeys = {
  scope: (context: ExplicitReadmatesApiContext) => [...hostClubQueryPrefix(context.clubSlug), "invitation-links"] as const,
  list: (page: PageRequest | undefined, context: ExplicitReadmatesApiContext) => [...hostInvitationLinkKeys.scope(context), "list", page ?? {}] as const,
  history: (linkId: string, page: PageRequest | undefined, context: ExplicitReadmatesApiContext) => [...hostInvitationLinkKeys.scope(context), "history", linkId, page ?? {}] as const,
};

export const hostInvitationLinkListQuery = (page: PageRequest | undefined, context: ExplicitReadmatesApiContext) => queryOptions({
  queryKey: hostInvitationLinkKeys.list(page, context),
  queryFn: () => fetchHostInvitationLinks(context, page),
});

export const hostInvitationLinkHistoryQuery = (linkId: string, page: PageRequest | undefined, context: ExplicitReadmatesApiContext) => queryOptions({
  queryKey: hostInvitationLinkKeys.history(linkId, page, context),
  queryFn: () => fetchHostInvitationLinkHistory(linkId, context, page),
});

export const invalidateHostInvitationLinks = (client: QueryClient, context: ExplicitReadmatesApiContext) =>
  client.invalidateQueries({ queryKey: hostInvitationLinkKeys.scope(context) });

export function useCreateHostInvitationLink(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "invitation-links", "create"),
    mutationFn: (request: CreateHostInvitationLinkRequest) => createHostInvitationLink(request, context),
    onSuccess: () => invalidateHostInvitationLinks(client, context),
  });
}

export function useUpdateHostInvitationLink(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "invitation-links", "update"),
    mutationFn: ({ linkId, request }: { linkId: string; request: UpdateHostInvitationLinkRequest }) => updateHostInvitationLink(linkId, request, context),
    onSuccess: () => invalidateHostInvitationLinks(client, context),
  });
}
