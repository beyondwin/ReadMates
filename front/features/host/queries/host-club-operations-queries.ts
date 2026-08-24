import { queryOptions } from "@tanstack/react-query";
import { fetchHostClubOperations } from "@/features/host/api/host-api";
import { hostClubQueryPrefix } from "./host-state-purge";

type HostClubContext = { clubSlug: string };

export const hostClubOperationsKeys = {
  scope: (context: HostClubContext) =>
    [...hostClubQueryPrefix(context.clubSlug), "club-operations"] as const,
  snapshot: (context: HostClubContext) => [...hostClubOperationsKeys.scope(context), "snapshot"] as const,
} as const;

export function hostClubOperationsQuery(context: HostClubContext) {
  return queryOptions({
    queryKey: hostClubOperationsKeys.snapshot(context),
    queryFn: () => fetchHostClubOperations(context),
    retry: false,
  });
}
