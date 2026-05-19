import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  enrichSessionDetailHighlightAuthors,
  memberArchiveSessionQuery,
} from "@/features/archive/queries/archive-queries";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export { enrichSessionDetailHighlightAuthors };

export type MemberSessionDetailRouteData = {
  sessionId: string | null;
};

function contextFromArgs(args: LoaderFunctionArgs) {
  return { clubSlug: clubSlugFromLoaderArgs(args) };
}

export function memberSessionDetailLoaderFactory(queryClient: QueryClient) {
  return async function memberSessionDetailLoader(args: LoaderFunctionArgs): Promise<MemberSessionDetailRouteData> {
    const { params } = args;
    const access = await loadArchiveMemberAuth(args);
    const sessionId = params.sessionId ?? null;

    if (!access.allowed || !sessionId) {
      return { sessionId };
    }

    await queryClient.ensureQueryData(memberArchiveSessionQuery(sessionId, contextFromArgs(args)));

    return { sessionId };
  };
}
