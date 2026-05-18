import { fetchPlatformAdminClubs, fetchPlatformAdminSummary } from "@/features/platform-admin/api/platform-admin-api";
import type {
  PlatformAdminClubListResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";
import type { QueryClient } from "@tanstack/react-query";
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

export function platformAdminLoaderFactory(queryClient: QueryClient) {
  return async function loadPlatformAdmin(args?: LoaderFunctionArgs): Promise<PlatformAdminRouteData> {
    await requirePlatformAdminLoaderAuth(args);

    const [summary, clubs] = await Promise.all([
      queryClient.fetchQuery(platformAdminSummaryQuery()),
      queryClient.fetchQuery(platformAdminClubsQuery()),
    ]);

    return { summary, clubs };
  };
}
