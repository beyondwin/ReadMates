import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/client";
import type { PublicClubResponse, PublicSessionDetailResponse } from "@/features/public/api/public-contracts";

export function fetchPublicClub() {
  return readmatesFetch<PublicClubResponse>("/api/public/club");
}

export async function fetchPublicSession(sessionId: string) {
  const response = await readmatesFetchResponse(`/api/public/sessions/${encodeURIComponent(sessionId)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`ReadMates public session fetch failed: ${sessionId} (${response.status})`);
  }

  return response.json() as Promise<PublicSessionDetailResponse>;
}
