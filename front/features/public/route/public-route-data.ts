import type { LoaderFunctionArgs } from "react-router-dom";
import { fetchPublicClub, fetchPublicSession } from "@/features/public/api/public-api";
import type { PublicClubResponse, PublicSessionDetailResponse } from "@/features/public/api/public-contracts";

export type PublicClubRouteData = PublicClubResponse;
export type PublicSessionRouteData = PublicSessionDetailResponse | null;

export function publicClubLoader(): Promise<PublicClubRouteData> {
  return fetchPublicClub();
}

export function publicSessionLoader({ params }: LoaderFunctionArgs): Promise<PublicSessionRouteData> {
  const sessionId = params.sessionId;

  if (!sessionId) {
    return Promise.resolve(null);
  }

  return fetchPublicSession(sessionId);
}
