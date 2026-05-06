import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/client";
import { apiErrorFromResponse } from "@/shared/api/errors";
import type { PublicClubResponse, PublicSessionDetailResponse } from "@/features/public/api/public-contracts";

export function fetchPublicClub(clubSlug: string) {
  return readmatesFetch<PublicClubResponse>(`/api/public/clubs/${encodeURIComponent(clubSlug)}`);
}

export async function fetchPublicSession(clubSlug: string, sessionId: string) {
  const response = await readmatesFetchResponse(
    `/api/public/clubs/${encodeURIComponent(clubSlug)}/sessions/${encodeURIComponent(sessionId)}`,
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  return response.json() as Promise<PublicSessionDetailResponse>;
}
