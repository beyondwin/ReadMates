import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import {
  AI_OPS_DEFAULT_WINDOW,
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  aiOpsWindowFromSearchParams,
  EMPTY_AI_OPS_FILTER,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";
import {
  platformAdminAiOpsJobQuery,
  platformAdminAiOpsJobsInfiniteQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export function adminAiOpsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminAiOps(args?: LoaderFunctionArgs) {
    await requirePlatformAdminLoaderAuth(args);
    const filter = args
      ? aiOpsFilterFromSearchParams(new URL(args.request.url).searchParams)
      : EMPTY_AI_OPS_FILTER;
    const window = args
      ? aiOpsWindowFromSearchParams(new URL(args.request.url).searchParams)
      : AI_OPS_DEFAULT_WINDOW;
    const queries: Promise<unknown>[] = [
      queryClient.fetchQuery(platformAdminAiOpsSummaryQuery(window)),
      queryClient.fetchInfiniteQuery(platformAdminAiOpsJobsInfiniteQuery(aiOpsFilterToQuery(filter))),
    ];
    if (filter.jobId) {
      queries.push(queryClient.fetchQuery(platformAdminAiOpsJobQuery(filter.jobId)));
    }
    await Promise.allSettled(queries);
    return null;
  };
}
