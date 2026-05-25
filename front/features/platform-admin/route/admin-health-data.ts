import type { QueryClient } from "@tanstack/react-query";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";

export function adminHealthLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminHealth() {
    await queryClient.fetchQuery(platformAdminHealthSnapshotQuery());
    return null;
  };
}
