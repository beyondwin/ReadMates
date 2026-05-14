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

export const hostInvitationKeys = {
  all: ["host", "invitations"] as const,
  list: (page?: PageRequest) =>
    [...hostInvitationKeys.all, "list", page ?? {}] as const,
} as const;

async function fetchHostInvitationList(page?: PageRequest): Promise<HostInvitationListPage> {
  const response = await listHostInvitationsResponse(undefined, page);
  return parseHostInvitationListResponse(response);
}

export function hostInvitationListQuery(page?: PageRequest) {
  return queryOptions({
    queryKey: hostInvitationKeys.list(page),
    queryFn: () => fetchHostInvitationList(page),
  });
}

export function invalidateHostInvitations(client: QueryClient) {
  return client.invalidateQueries({ queryKey: hostInvitationKeys.all });
}

export function useCreateInvitationMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateHostInvitationRequest) => {
      const response = await createHostInvitation(request);
      return parseHostInvitationResponse(response);
    },
    onSuccess: () => invalidateHostInvitations(client),
  });
}

export function useRevokeInvitationMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await revokeHostInvitation(invitationId);
      return parseHostInvitationResponse(response);
    },
    onSuccess: () => invalidateHostInvitations(client),
  });
}
