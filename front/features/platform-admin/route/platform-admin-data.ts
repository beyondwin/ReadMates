import { fetchPlatformAdminSummary } from "@/features/platform-admin/api/platform-admin-api";
import type { PlatformAdminSummaryResponse } from "@/features/platform-admin/api/platform-admin-contracts";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";
import type { LoaderFunctionArgs } from "react-router-dom";

export type PlatformAdminRouteData = {
  summary: PlatformAdminSummaryResponse;
};

export async function platformAdminLoader(args?: LoaderFunctionArgs): Promise<PlatformAdminRouteData> {
  await requirePlatformAdminLoaderAuth(args);

  return {
    summary: await fetchPlatformAdminSummary(),
  };
}
