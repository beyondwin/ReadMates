import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchHostMembers,
  submitHostMemberLifecycle,
  submitHostMemberProfile,
  submitHostViewerAction,
} from "@/features/host/api/host-api";
import type {
  HostMemberListPage,
  MemberLifecycleRequest,
} from "@/features/host/api/host-contracts";
import type {
  HostMemberLifecyclePath,
  HostViewerAction,
} from "@/features/host/model/host-member-actions";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import { hostClubQueryPrefix, hostMutationKey } from "./host-state-purge";

export const hostMemberKeys = {
  scope: (context: ExplicitReadmatesApiContext) =>
    [...hostClubQueryPrefix(context.clubSlug), "members"] as const,
  list: (page: PageRequest | undefined, context: ExplicitReadmatesApiContext) =>
    [...hostMemberKeys.scope(context), "list", page ?? {}] as const,
} as const;

async function fetchHostMemberList(
  context: ExplicitReadmatesApiContext,
  page?: PageRequest,
): Promise<HostMemberListPage> {
  return fetchHostMembers(context, page);
}

export function hostMemberListQuery(page: PageRequest | undefined, context: ExplicitReadmatesApiContext) {
  return queryOptions({
    queryKey: hostMemberKeys.list(page, context),
    queryFn: () => fetchHostMemberList(context, page),
  });
}

export function invalidateHostMembers(client: QueryClient, context: ExplicitReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostMemberKeys.scope(context) });
}

export function useHostMemberLifecycleMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "members", "lifecycle"),
    mutationFn: async ({
      membershipId,
      path,
      body,
    }: {
      membershipId: string;
      path: HostMemberLifecyclePath;
      body?: MemberLifecycleRequest;
    }) => submitHostMemberLifecycle(membershipId, path, body, context),
    onSuccess: () => invalidateHostMembers(client, context),
  });
}

export function useHostMemberProfileMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "members", "profile"),
    mutationFn: async ({
      membershipId,
      displayName,
    }: {
      membershipId: string;
      displayName: string;
    }) => submitHostMemberProfile(membershipId, displayName, context),
    onSuccess: () => invalidateHostMembers(client, context),
  });
}

export function useHostViewerActionMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "members", "viewer"),
    mutationFn: async ({
      membershipId,
      action,
    }: {
      membershipId: string;
      action: HostViewerAction;
    }) => submitHostViewerAction(membershipId, action, context),
    onSuccess: () => invalidateHostMembers(client, context),
  });
}
