import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { getCurrentSession } from "@/features/current-session/api/current-session-api";
import { currentSessionQuery } from "@/features/current-session/queries/current-session-queries";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { clubSlugFromLoaderArgs, loadMemberAppAuth } from "@/shared/auth/member-app-loader";

export type CurrentSessionRouteData = {
  auth: AuthMeResponse;
  current: Awaited<ReturnType<typeof getCurrentSession>>;
};

export async function loadCurrentSessionRouteData(args?: Pick<LoaderFunctionArgs, "params">): Promise<CurrentSessionRouteData> {
  const { auth, allowed } = await loadMemberAppAuth(args);

  if (!allowed) {
    return { auth, current: { currentSession: null } };
  }

  const context = { clubSlug: clubSlugFromLoaderArgs(args) };
  const current = await getCurrentSession(context);

  return { auth, current };
}

export function currentSessionLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<CurrentSessionRouteData> => {
    const { auth, allowed } = await loadMemberAppAuth(args);

    if (!allowed) {
      return { auth, current: { currentSession: null } };
    }

    const context = { clubSlug: clubSlugFromLoaderArgs(args) };
    const current = await client.fetchQuery(currentSessionQuery(context));

    return { auth, current };
  };
}

export async function currentSessionLoader(args?: LoaderFunctionArgs): Promise<CurrentSessionRouteData> {
  return loadCurrentSessionRouteData(args);
}
