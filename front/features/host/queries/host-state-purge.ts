import type { QueryClient } from "@tanstack/react-query";
import type { HostSensitiveStorage } from "@/features/host/storage/host-sensitive-storage";
import { cancelClubHostRequests } from "@/shared/api/host-authority-event";

export function hostClubQueryPrefix(clubSlug: string) {
  return ["host", clubSlug] as const;
}

export function hostClubMutationPrefix(clubSlug: string) {
  return ["host-mutation", clubSlug] as const;
}

export function hostMutationKey(clubSlug: string, ...parts: readonly unknown[]) {
  return [...hostClubMutationPrefix(clubSlug), ...parts] as const;
}

export async function purgeClubHostState(input: {
  clubSlug: string;
  queryClient: QueryClient;
  storage: Pick<HostSensitiveStorage, "clearClub">;
}): Promise<void> {
  const queryKey = hostClubQueryPrefix(input.clubSlug);
  const mutationKey = hostClubMutationPrefix(input.clubSlug);
  cancelClubHostRequests(input.clubSlug);
  await input.queryClient.cancelQueries({ queryKey });
  for (const mutation of input.queryClient.getMutationCache().findAll({ mutationKey })) {
    input.queryClient.getMutationCache().remove(mutation);
  }
  await input.storage.clearClub(input.clubSlug);
  input.queryClient.removeQueries({ queryKey });
}
