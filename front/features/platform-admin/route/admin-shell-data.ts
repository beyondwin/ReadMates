import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export function adminShellLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminShell(args?: LoaderFunctionArgs) {
    const auth = await requirePlatformAdminLoaderAuth(args);
    await Promise.all([
      queryClient.fetchQuery(platformAdminSummaryQuery()),
      queryClient.fetchQuery(platformAdminClubsQuery()),
    ]);
    return auth;
  };
}
