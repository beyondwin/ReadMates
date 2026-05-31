import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { adminAuditFiltersFromSearchParams } from "@/features/platform-admin/model/platform-admin-audit-model";
import { platformAdminAuditLedgerQuery } from "@/features/platform-admin/queries/platform-admin-audit-queries";

export function adminAuditLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminAudit(args?: LoaderFunctionArgs) {
    const filters = args ? adminAuditFiltersFromSearchParams(new URL(args.request.url).searchParams) : { range: "7d" as const };
    await queryClient.fetchQuery(platformAdminAuditLedgerQuery(filters));
    return null;
  };
}
