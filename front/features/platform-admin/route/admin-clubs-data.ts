import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import { platformAdminClubListFiltersFromSearch } from "@/features/platform-admin/model/platform-admin-club-list-filters";
import { platformAdminClubsInfiniteQuery } from "@/features/platform-admin/queries/platform-admin-queries";

export function adminClubsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminClubs({ request }: LoaderFunctionArgs) {
    const filters = platformAdminClubListFiltersFromSearch(
      new URL(request.url).searchParams,
    );
    await queryClient.fetchInfiniteQuery(
      platformAdminClubsInfiniteQuery(filters),
    );
    return null;
  };
}
