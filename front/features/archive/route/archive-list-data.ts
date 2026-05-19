import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  archiveListQuery,
  emptyArchiveListQueryData,
  type ArchiveListQueryData,
} from "@/features/archive/queries/archive-queries";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export type ArchiveListRouteData = ArchiveListQueryData;

function contextFromArgs(args?: LoaderFunctionArgs) {
  return { clubSlug: clubSlugFromLoaderArgs(args) };
}

export function archiveListLoaderFactory(queryClient: QueryClient) {
  return async function archiveListLoader(args?: LoaderFunctionArgs): Promise<ArchiveListRouteData> {
    const access = await loadArchiveMemberAuth(args);
    const context = contextFromArgs(args);

    if (!access.allowed) {
      return emptyArchiveListQueryData();
    }

    return queryClient.ensureQueryData(archiveListQuery(context));
  };
}
