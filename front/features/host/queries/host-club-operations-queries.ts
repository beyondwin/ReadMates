import { queryOptions } from "@tanstack/react-query";
import { fetchHostClubOperations } from "@/features/host/api/host-api";
import type { ReadmatesApiContext } from "@/shared/api/client";

export const hostClubOperationsKeys = {
  all: ["host", "club-operations"] as const,
  snapshot: (clubSlug: string | undefined) => [...hostClubOperationsKeys.all, clubSlug ?? "__self__"] as const,
} as const;

export function hostClubOperationsQuery(context: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostClubOperationsKeys.snapshot(context.clubSlug),
    queryFn: () => fetchHostClubOperations(context),
  });
}
