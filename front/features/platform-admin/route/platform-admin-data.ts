import { fetchPlatformAdminClubs, fetchPlatformAdminSummary } from "@/features/platform-admin/api/platform-admin-api";
import type {
  PlatformAdminClubListResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";
import type { LoaderFunctionArgs } from "react-router-dom";

export type PlatformAdminRouteData = {
  summary: PlatformAdminSummaryResponse;
  clubs: PlatformAdminClubListResponse;
};

export async function platformAdminLoader(args?: LoaderFunctionArgs): Promise<PlatformAdminRouteData> {
  await requirePlatformAdminLoaderAuth(args);

  const [summary, clubs] = await Promise.all([
    fetchPlatformAdminSummary(),
    fetchPlatformAdminClubs(),
  ]);

  return { summary, clubs };
}
