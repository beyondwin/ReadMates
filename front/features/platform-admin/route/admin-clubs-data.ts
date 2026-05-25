import type { QueryClient } from "@tanstack/react-query";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";

export function adminClubsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminClubs() {
    await queryClient.fetchQuery(platformAdminClubsQuery());
    return null;
  };
}
