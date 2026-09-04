import type { QueryClient } from "@tanstack/react-query";
import { replace, type LoaderFunctionArgs } from "react-router";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { normalizeSupportGrantStatus } from "@/features/platform-admin/model/platform-admin-support-model";
import { platformAdminSupportLedgerInfiniteQuery } from "@/features/platform-admin/queries/platform-admin-support-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

const SAFE_SUPPORT_PARAMS: ReadonlySet<string> = new Set(["clubId", "status"]);

export function adminSupportLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminSupport(args: LoaderFunctionArgs) {
    await requirePlatformAdminLoaderAuth(args);
    const url = new URL(args.request.url);
    const clubId = url.searchParams.get("clubId") ?? undefined;
    const status = normalizeSupportGrantStatus(url.searchParams.get("status"));
    const hasUnsafeParams = [...url.searchParams.keys()].some((key) => !SAFE_SUPPORT_PARAMS.has(key));
    const hasInvalidStatus = url.searchParams.has("status") && status === undefined;
    if (hasUnsafeParams || hasInvalidStatus) {
      const clean = new URLSearchParams();
      if (clubId) clean.set("clubId", clubId);
      if (status) clean.set("status", status);
      throw replace(`${url.pathname}${clean.size ? `?${clean.toString()}` : ""}`);
    }
    await Promise.all([
      queryClient.fetchQuery(platformAdminClubsQuery()),
      queryClient.fetchInfiniteQuery(platformAdminSupportLedgerInfiniteQuery({
        ...(clubId ? { clubId } : {}),
        ...(status ? { status } : {}),
      })),
    ]);
    return null;
  };
}
