import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  deferHostWorkboxItem,
  fetchHostWorkboxPage,
  removeHostWorkboxDeferral,
  type HostWorkboxPageRequest,
} from "../api/host-workbox-api";
import type { HostWorkboxDeferralRequest } from "../api/host-workbox-contracts";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import { hostSessionKeys } from "./host-session-queries";
import { hostClubQueryPrefix, hostMutationKey } from "./host-state-purge";

function pageIdentity(request: HostWorkboxPageRequest) {
  return {
    state: request.state,
    cursor: request.cursor ?? null,
    limit: request.limit ?? 20,
  } as const;
}

export const hostWorkboxKeys = {
  scope: (context: ExplicitReadmatesApiContext) =>
    [...hostClubQueryPrefix(context.clubSlug), "workbox"] as const,
  page: (request: HostWorkboxPageRequest, context: ExplicitReadmatesApiContext) =>
    [...hostWorkboxKeys.scope(context), pageIdentity(request)] as const,
} as const;

export function hostWorkboxPageQuery(
  request: HostWorkboxPageRequest,
  context: ExplicitReadmatesApiContext,
) {
  return queryOptions({
    queryKey: hostWorkboxKeys.page(request, context),
    queryFn: () => fetchHostWorkboxPage(request, context),
  });
}

async function invalidateHostWorkboxComposition(
  client: QueryClient,
  context: ExplicitReadmatesApiContext,
) {
  await Promise.all([
    client.invalidateQueries({ queryKey: hostWorkboxKeys.scope(context) }),
    client.invalidateQueries({ queryKey: hostSessionKeys.operatingRoomCurrent(context) }),
  ]);
}

export function useDeferHostWorkboxItemMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "workbox", "defer"),
    mutationFn: (input: HostWorkboxDeferralRequest & { key: string }) => {
      const { key, ...request } = input;
      return deferHostWorkboxItem(key, request, context);
    },
    onSuccess: () => invalidateHostWorkboxComposition(client, context),
  });
}

export function useRemoveHostWorkboxDeferralMutation(context: ExplicitReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: hostMutationKey(context.clubSlug, "workbox", "remove-deferral"),
    mutationFn: (key: string) => removeHostWorkboxDeferral(key, context),
    onSuccess: () => invalidateHostWorkboxComposition(client, context),
  });
}
