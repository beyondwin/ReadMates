import { queryOptions } from "@tanstack/react-query";
import { fetchAdminClubOperationsSnapshot } from "@/features/platform-admin/api/platform-admin-club-operations-api";

export const platformAdminClubOperationsKeys = {
  all: ["platform-admin", "club-operations"] as const,
  snapshot: (clubId: string) => [...platformAdminClubOperationsKeys.all, clubId] as const,
} as const;

export function platformAdminClubOperationsQuery(clubId: string) {
  return queryOptions({
    queryKey: platformAdminClubOperationsKeys.snapshot(clubId),
    queryFn: () => fetchAdminClubOperationsSnapshot(clubId),
  });
}
