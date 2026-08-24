import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateHostInvitationRequest,
  HostInvitationListPage,
} from "@/features/host/api/host-contracts";
import {
  createHostInvitation,
  listHostInvitationsResponse,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  revokeHostInvitation,
} from "@/features/host/api/host-api";
import type { PageRequest } from "@/shared/model/paging";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import { hostClubQueryPrefix, hostMutationKey } from "./host-state-purge";

export const hostInvitationKeys = {
  scope: (context: ExplicitReadmatesApiContext) =>
    [...hostClubQueryPrefix(context.clubSlug), "invitations"] as const,
  list: (page: PageRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostInvitationKeys.scope(context), "list", page ?? {}] as const,
} as const;

async function fetchHostInvitationList(
  context: ExplicitReadmatesApiContext,
  page?: PageRequest,
): Promise<HostInvitationListPage> {
  const response = await listHostInvitationsResponse(context, page);
  return parseHostInvitationListResponse(response);
}

export function hostInvitationListQuery(page: PageRequest | undefined, context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: hostInvitationKeys.list(page, context),
    queryFn: () => fetchHostInvitationList(context, page),
  });
}

export function invalidateHostInvitations(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostInvitationKeys.scope(context) });
}

export function useCreateInvitationMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "invitations", "create"),
    mutationFn: async (request: CreateHostInvitationRequest) => {
      const response = await createHostInvitation(request, context);
      return parseHostInvitationResponse(response);
    },
    onSuccess: () => invalidateHostInvitations(client, context),
  });
}

export function useRevokeInvitationMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "invitations", "revoke"),
    mutationFn: async (invitationId: string) => {
      const response = await revokeHostInvitation(invitationId, context);
      return parseHostInvitationResponse(response);
    },
    onSuccess: () => invalidateHostInvitations(client, context),
  });
}
