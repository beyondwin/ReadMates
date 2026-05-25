import { readmatesFetch } from "@/shared/api/client";
import type { PlatformHealthSnapshotResponse } from "@/features/platform-admin/api/platform-admin-health-contracts";

export function fetchPlatformAdminHealthSnapshot() {
  return readmatesFetch<PlatformHealthSnapshotResponse>(
    "/api/admin/health/snapshot",
    undefined,
    { clubSlug: undefined },
  );
}
