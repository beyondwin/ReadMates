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
} from "@/features/host/route/host-members-actions";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";

export const hostMemberKeys = {
  all: ["host", "members"] as const,
  list: (page?: PageRequest) => [...hostMemberKeys.all, "list", page ?? {}] as const,
} as const;

async function fetchHostMemberList(
  context?: ReadmatesApiContext,
  page?: PageRequest,
): Promise<HostMemberListPage> {
  return fetchHostMembers(context, page);
}

export function hostMemberListQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostMemberKeys.list(page),
    queryFn: () => fetchHostMemberList(context, page),
  });
}

export function invalidateHostMembers(client: QueryClient) {
  return client.invalidateQueries({ queryKey: hostMemberKeys.all });
}

export function useHostMemberLifecycleMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      membershipId,
      path,
      body,
    }: {
      membershipId: string;
      path: HostMemberLifecyclePath;
      body?: MemberLifecycleRequest;
    }) => submitHostMemberLifecycle(membershipId, path, body),
    onSuccess: () => invalidateHostMembers(client),
  });
}

export function useHostMemberProfileMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      membershipId,
      displayName,
    }: {
      membershipId: string;
      displayName: string;
    }) => submitHostMemberProfile(membershipId, displayName),
    onSuccess: () => invalidateHostMembers(client),
  });
}

export function useHostViewerActionMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      membershipId,
      action,
    }: {
      membershipId: string;
      action: HostViewerAction;
    }) => submitHostViewerAction(membershipId, action),
    onSuccess: () => invalidateHostMembers(client),
  });
}
