import type { LoaderFunctionArgs } from "react-router-dom";
import { fetchPublicClub, fetchPublicSession } from "@/features/public/api/public-api";
import type { PublicClubResponse, PublicSessionDetailResponse } from "@/features/public/api/public-contracts";
import { BASELINE_PUBLIC_CLUB_SLUG } from "@/features/public/model/public-url-policy";

export type PublicClubRouteData = PublicClubResponse & {
  clubSlug: string;
  publicBasePath: string;
};
export type PublicSessionRouteData = {
  clubSlug: string;
  publicBasePath: string;
  session: PublicSessionDetailResponse | null;
};

function publicRouteContext(params: LoaderFunctionArgs["params"]) {
  const clubSlug = params.clubSlug ?? BASELINE_PUBLIC_CLUB_SLUG;
  const publicBasePath = params.clubSlug ? `/clubs/${encodeURIComponent(clubSlug)}` : "";

  return { clubSlug, publicBasePath };
}

export async function publicClubLoader({ params }: LoaderFunctionArgs): Promise<PublicClubRouteData> {
  const context = publicRouteContext(params);
  const club = await fetchPublicClub(context.clubSlug);

  return { ...club, ...context };
}

export async function publicSessionLoader({ params }: LoaderFunctionArgs): Promise<PublicSessionRouteData> {
  const sessionId = params.sessionId;
  const context = publicRouteContext(params);

  if (!sessionId) {
    return { ...context, session: null };
  }

  const session = await fetchPublicSession(context.clubSlug, sessionId);
  return { ...context, session };
}
