import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  EMPTY_AI_OPS_FILTER,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";

export function adminAiOpsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminAiOps(args?: LoaderFunctionArgs) {
    const filter = args
      ? aiOpsFilterFromSearchParams(new URL(args.request.url).searchParams)
      : EMPTY_AI_OPS_FILTER;
    await Promise.all([
      queryClient.fetchQuery(platformAdminAiOpsSummaryQuery()),
      queryClient.fetchQuery(platformAdminAiOpsJobsQuery(aiOpsFilterToQuery(filter))),
    ]);
    return null;
  };
}
