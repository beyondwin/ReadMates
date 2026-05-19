import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { BASELINE_PUBLIC_CLUB_SLUG } from "@/features/public/model/public-url-policy";
import { publicClubQuery, publicSessionQuery } from "@/features/public/queries/public-queries";

export type PublicClubRouteData = {
  clubSlug: string;
  publicBasePath: string;
};
export type PublicSessionRouteData = {
  clubSlug: string;
  publicBasePath: string;
  sessionId: string | null;
};

function publicRouteContext(params: LoaderFunctionArgs["params"]) {
  const clubSlug = params.clubSlug ?? BASELINE_PUBLIC_CLUB_SLUG;
  const publicBasePath = params.clubSlug ? `/clubs/${encodeURIComponent(clubSlug)}` : "";

  return { clubSlug, publicBasePath };
}

export function publicClubLoaderFactory(queryClient: QueryClient) {
  return async function publicClubLoader({ params }: LoaderFunctionArgs): Promise<PublicClubRouteData> {
    const context = publicRouteContext(params);
    await queryClient.ensureQueryData(publicClubQuery(context.clubSlug));

    return context;
  };
}

export function publicSessionLoaderFactory(queryClient: QueryClient) {
  return async function publicSessionLoader({ params }: LoaderFunctionArgs): Promise<PublicSessionRouteData> {
    const sessionId = params.sessionId ?? null;
    const context = publicRouteContext(params);

    if (!sessionId) {
      return { ...context, sessionId: null };
    }

    await queryClient.ensureQueryData(publicSessionQuery(context.clubSlug, sessionId));

    return { ...context, sessionId };
  };
}
