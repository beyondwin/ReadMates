import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import { platformAdminClubDetailQuery } from "@/features/platform-admin/queries/platform-admin-queries";

export function adminClubDetailLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminClubDetail(args: LoaderFunctionArgs) {
    const clubId = args.params.clubId;
    if (!clubId) throw new Response("Missing clubId", { status: 400 });
    await queryClient.fetchQuery(platformAdminClubDetailQuery(clubId));
    return { clubId };
  };
}
