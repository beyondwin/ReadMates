import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export function adminShellLoaderFactory(queryClient: QueryClient) {
  installPlatformAdminAuthorityLossHandler(queryClient);
  return async function loadAdminShell(args?: LoaderFunctionArgs) {
    const auth = await requirePlatformAdminLoaderAuth(args);
    await queryClient.fetchQuery({
      ...platformAdminCapabilitiesQuery(),
      staleTime: 0,
    });
    return auth;
  };
}
