/**
 * Browser-side fetch wrappers for the AI session-generation API (spec §7).
 *
 * All paths are issued against the Cloudflare BFF (`/api/bff/...`), which
 * forwards them to the Spring backend. The server-side controller lives
 * at `/api/host/sessions/{sessionId}/ai-generate/...` and the per-club
 * defaults at `/api/host/clubs/{clubSlug}/ai-defaults`.
 */

import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/client";
import { apiErrorFromResponse } from "@/shared/api/errors";
import type {
  AiCommitResponse,
  AiGenerationJobResponse,
  ClubAiDefaultRequest,
  ClubAiDefaultResponse,
  CommitGenerationRequest,
  RegenerateRequest,
  RegenerateResponse,
  StartGenerationBody,
  StartGenerationRequest,
  StartGenerationResponse,
} from "./aigen-contracts";

function sessionsPath(sessionId: string, suffix = ""): string {
  return `/api/host/sessions/${encodeURIComponent(sessionId)}/ai-generate${suffix}`;
}

function jobPath(sessionId: string, jobId: string, suffix = ""): string {
  return sessionsPath(sessionId, `/jobs/${encodeURIComponent(jobId)}${suffix}`);
}

function clubsPath(clubSlug: string): string {
  return `/api/host/clubs/${encodeURIComponent(clubSlug)}/ai-defaults`;
}

export function startGeneration(
  sessionId: string,
  payload: StartGenerationRequest,
): Promise<StartGenerationResponse> {
  const body: StartGenerationBody = {
    authorNameMode: payload.authorNameMode,
  };
  if (payload.model !== undefined) {
    body.model = payload.model;
  }
  if (payload.instructions !== undefined) {
    body.instructions = payload.instructions;
  }

  const form = new FormData();
  form.append("transcript", payload.transcript);
  form.append(
    "body",
    new Blob([JSON.stringify(body)], { type: "application/json" }),
  );

  // Leave Content-Type unset so the browser fills in the multipart boundary.
  return readmatesFetch<StartGenerationResponse>(sessionsPath(sessionId, "/jobs"), {
    method: "POST",
    body: form,
  });
}

export function getJob(
  sessionId: string,
  jobId: string,
): Promise<AiGenerationJobResponse> {
  return readmatesFetch<AiGenerationJobResponse>(jobPath(sessionId, jobId));
}

export function regenerateItem(
  sessionId: string,
  jobId: string,
  request: RegenerateRequest,
): Promise<RegenerateResponse> {
  return readmatesFetch<RegenerateResponse>(jobPath(sessionId, jobId, "/regenerate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function commitGeneration(
  sessionId: string,
  jobId: string,
  request: CommitGenerationRequest,
): Promise<AiCommitResponse> {
  return readmatesFetch<AiCommitResponse>(jobPath(sessionId, jobId, "/commit"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function cancelGeneration(
  sessionId: string,
  jobId: string,
): Promise<void> {
  const response = await readmatesFetchResponse(jobPath(sessionId, jobId), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
}

export function getClubAiDefault(clubSlug: string): Promise<ClubAiDefaultResponse> {
  return readmatesFetch<ClubAiDefaultResponse>(clubsPath(clubSlug));
}

export async function putClubAiDefault(
  clubSlug: string,
  request: ClubAiDefaultRequest,
): Promise<void> {
  const response = await readmatesFetchResponse(clubsPath(clubSlug), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
}
