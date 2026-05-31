import { queryOptions } from "@tanstack/react-query";
import { fetchHostClubOperations } from "@/features/host/api/host-api";

export const hostClubOperationsKeys = {
  all: ["host", "club-operations"] as const,
  snapshot: (clubSlug: string | undefined) => [...hostClubOperationsKeys.all, clubSlug ?? "__self__"] as const,
} as const;

export function hostClubOperationsQuery(context: { clubSlug: string | undefined }) {
  return queryOptions({
    queryKey: hostClubOperationsKeys.snapshot(context.clubSlug),
    queryFn: () => fetchHostClubOperations(context),
  });
}
