import type { QueryClient } from "@tanstack/react-query";
import { replace, type LoaderFunctionArgs } from "react-router";
import {
  enrichSessionDetailHighlightAuthors,
  memberArchiveSessionQuery,
} from "@/features/archive/queries/archive-queries";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { isReadmatesApiError } from "@/shared/api/errors";

export { enrichSessionDetailHighlightAuthors };

export type MemberSessionDetailRouteData = {
  sessionId: string | null;
  auth: AuthMeResponse;
};

function contextFromArgs(args: LoaderFunctionArgs) {
  return { clubSlug: clubSlugFromLoaderArgs(args) };
}

export function memberSessionDetailLoaderFactory(
  queryClient: QueryClient,
  unavailableDetailTarget: (pathname: string) => string,
) {
  return async function memberSessionDetailLoader(args: LoaderFunctionArgs): Promise<MemberSessionDetailRouteData> {
    const { params } = args;
    const access = await loadArchiveMemberAuth(args);
    const sessionId = params.sessionId ?? null;

    if (!access.allowed || !sessionId) {
      return { sessionId, auth: access.auth };
    }

    let detail;
    try {
      detail = await queryClient.fetchQuery({
        ...memberArchiveSessionQuery(sessionId, contextFromArgs(args)),
        staleTime: 0,
      });
    } catch (error) {
      if (!isReadmatesApiError(error) || (error.status !== 401 && error.status !== 403)) {
        throw error;
      }
      throw replace(unavailableDetailTarget(new URL(args.request.url).pathname));
    }
    if (!detail) {
      throw replace(
        unavailableDetailTarget(new URL(args.request.url).pathname),
      );
    }

    return { sessionId, auth: access.auth };
  };
}
