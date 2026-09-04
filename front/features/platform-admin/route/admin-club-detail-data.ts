import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import { platformAdminClubDetailQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export function adminClubDetailLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminClubDetail(args: LoaderFunctionArgs) {
    await requirePlatformAdminLoaderAuth(args);
    const clubId = args.params.clubId;
    if (!clubId) throw new Response("Missing clubId", { status: 400 });
    await queryClient.fetchQuery(platformAdminClubDetailQuery(clubId));
    return { clubId };
  };
}
