import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminSupportLedgerQuery } from "@/features/platform-admin/queries/platform-admin-support-queries";

export function adminSupportLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminSupport(args: LoaderFunctionArgs) {
    const url = new URL(args.request.url);
    const clubId = url.searchParams.get("clubId") ?? undefined;
    await Promise.all([
      queryClient.fetchQuery(platformAdminClubsQuery()),
      clubId ? queryClient.fetchQuery(platformAdminSupportLedgerQuery({ clubId })) : Promise.resolve(),
    ]);
    return null;
  };
}
