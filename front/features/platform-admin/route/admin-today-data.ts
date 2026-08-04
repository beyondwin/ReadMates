import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import { parseAdminOperationsSearch } from "@/features/platform-admin/model/platform-admin-operations-model";
import { platformAdminOperationCasesQuery } from "@/features/platform-admin/queries/platform-admin-operations-queries";

export function adminTodayLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminToday({ request }: LoaderFunctionArgs) {
    const { filter } = parseAdminOperationsSearch(new URL(request.url).searchParams);
    await queryClient.fetchQuery(platformAdminOperationCasesQuery(filter));
    return null;
  };
}
