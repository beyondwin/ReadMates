import { queryOptions } from "@tanstack/react-query";
import { fetchPlatformAdminHealthSnapshot } from "@/features/platform-admin/api/platform-admin-health-api";
import { platformAdminKeys } from "@/features/platform-admin/queries/platform-admin-queries";

const REFRESH_INTERVAL_MS = 15_000;
const STALE_TIME_MS = 5_000;

export function platformAdminHealthSnapshotQuery() {
  return queryOptions({
    queryKey: [...platformAdminKeys.all, "health-snapshot"] as const,
    queryFn: fetchPlatformAdminHealthSnapshot,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
  });
}
