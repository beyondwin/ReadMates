import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminOperationCasesQuery } from "@/features/platform-admin/queries/platform-admin-operations-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export function adminShellLoaderFactory(queryClient: QueryClient) {
  installPlatformAdminAuthorityLossHandler(queryClient);
  return async function loadAdminShell(args?: LoaderFunctionArgs) {
    const auth = await requirePlatformAdminLoaderAuth(args);
    await Promise.all([
      queryClient.fetchQuery({
        ...platformAdminCapabilitiesQuery(),
        staleTime: 0,
      }),
      queryClient.fetchQuery(platformAdminSummaryQuery()),
      queryClient.fetchQuery(platformAdminClubsQuery()),
    ]);
    await queryClient.prefetchQuery(platformAdminOperationCasesQuery());
    return auth;
  };
}
