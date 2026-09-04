import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export function adminHealthLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminHealth(args?: LoaderFunctionArgs) {
    await requirePlatformAdminLoaderAuth(args);
    await queryClient.fetchQuery(platformAdminHealthSnapshotQuery());
    return null;
  };
}
