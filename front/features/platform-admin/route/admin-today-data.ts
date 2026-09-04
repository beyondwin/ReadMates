import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import type {
  AdminOperationCase,
  AdminOperationCasesResponse,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import {
  effectiveAdminOperationsFilter,
  parseAdminOperationsSearch,
} from "@/features/platform-admin/model/platform-admin-operations-model";
import { platformAdminOperationCasePagesQuery } from "@/features/platform-admin/queries/platform-admin-operations-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export function adminTodayLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminToday({ request }: LoaderFunctionArgs) {
    await requirePlatformAdminLoaderAuth({ request });
    const search = parseAdminOperationsSearch(new URL(request.url).searchParams);
    const filter = { ...effectiveAdminOperationsFilter(search) };
    delete filter.cursor;
    await queryClient.prefetchInfiniteQuery(platformAdminOperationCasePagesQuery(filter));
    return null;
  };
}

export function combineAdminOperationCasePages(
  pages: readonly AdminOperationCasesResponse[],
): AdminOperationCasesResponse | null {
  const firstPage = pages[0];
  if (!firstPage) return null;
  const cases = new Map<string, AdminOperationCase>();
  for (const page of pages) {
    for (const item of page.items) {
      const current = cases.get(item.id);
      if (!current || item.version > current.version) cases.set(item.id, item);
    }
  }
  return {
    ...firstPage,
    items: [...cases.values()],
    nextCursor: pages.at(-1)?.nextCursor ?? null,
  };
}
