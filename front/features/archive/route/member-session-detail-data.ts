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
import { resolveUnavailableDetailTarget } from "@/src/app/workspace-route-model";

export { enrichSessionDetailHighlightAuthors };

export type MemberSessionDetailRouteData = {
  sessionId: string | null;
  auth: AuthMeResponse;
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
      return { sessionId, auth: access.auth };
    }

    let detail;
    try {
      detail = await queryClient.ensureQueryData(memberArchiveSessionQuery(sessionId, contextFromArgs(args)));
    } catch (error) {
      if (!isReadmatesApiError(error) || (error.status !== 401 && error.status !== 403)) {
        throw error;
      }
      throw replace(resolveUnavailableDetailTarget({ pathname: new URL(args.request.url).pathname }));
    }
    if (!detail) {
      throw replace(
        resolveUnavailableDetailTarget({
          pathname: new URL(args.request.url).pathname,
        }),
      );
    }

    return { sessionId, auth: access.auth };
  };
}
