import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  platformAdminClubsQuery,
  platformAdminSupportGrantsQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminClubOperationsQuery } from "@/features/platform-admin/queries/platform-admin-club-operations-queries";

export function adminClubDetailLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminClubDetail(args: LoaderFunctionArgs) {
    const clubId = args.params.clubId;
    if (!clubId) throw new Response("Missing clubId", { status: 400 });
    await Promise.all([
      queryClient.fetchQuery(platformAdminClubsQuery()),
      queryClient.fetchQuery(platformAdminSupportGrantsQuery(clubId)),
      queryClient.fetchQuery(platformAdminClubOperationsQuery(clubId)),
    ]);
    return { clubId };
  };
}
