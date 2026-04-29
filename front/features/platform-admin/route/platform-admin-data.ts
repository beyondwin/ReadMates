import { fetchPlatformAdminSummary } from "@/features/platform-admin/api/platform-admin-api";
import type { PlatformAdminSummaryResponse } from "@/features/platform-admin/api/platform-admin-contracts";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export type PlatformAdminRouteData = {
  summary: PlatformAdminSummaryResponse;
};

export async function platformAdminLoader(): Promise<PlatformAdminRouteData> {
  await requirePlatformAdminLoaderAuth();

  return {
    summary: await fetchPlatformAdminSummary(),
  };
}
