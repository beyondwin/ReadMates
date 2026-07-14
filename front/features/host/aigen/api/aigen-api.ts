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
import { parseReadmatesResponse } from "@/shared/api/response";
import type {
  AiGenerationProblem,
  AiCommitResponse,
  AiGenerationJobResponse,
  AiRecentJobResponse,
  AvailableGenerationModelsResponse,
  ClubAiDefaultRequest,
  ClubAiDefaultResponse,
  CommitGenerationRequest,
  RegenerateRequest,
  RegenerateResponse,
  StartGenerationBody,
  StartGenerationRequest,
  StartGenerationResponse,
  ExpandedEvidenceTurn,
} from "./aigen-contracts";

const GENERIC_AI_PROBLEM: AiGenerationProblem = {
  code: "AI_GENERATION_REQUEST_FAILED",
  detail: "AI 요청을 처리할 수 없습니다.",
};
const MAX_INVALID_SPEAKER_LABELS = 20;
const MAX_INVALID_SPEAKER_LABEL_CODE_POINTS = 120;

export class AiGenerationApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: AiGenerationProblem,
  ) {
    super(problem.detail);
    this.name = "AiGenerationApiError";
  }
}

function boundedLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Array.from(value).slice(0, MAX_INVALID_SPEAKER_LABEL_CODE_POINTS).join("");
}

function parseAiProblem(value: unknown, responseStatus: number): AiGenerationProblem | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (
    body.status !== responseStatus ||
    typeof body.code !== "string" ||
    typeof body.detail !== "string" ||
    body.detail.length > 500
  ) {
    return null;
  }
  const labels = Array.isArray(body.invalidSpeakerLabels)
    ? body.invalidSpeakerLabels
        .slice(0, MAX_INVALID_SPEAKER_LABELS)
        .map(boundedLabel)
        .filter((label): label is string => label !== null)
    : undefined;
  const revision =
    typeof body.currentRevision === "number" &&
    Number.isSafeInteger(body.currentRevision) &&
    body.currentRevision >= 0
      ? body.currentRevision
      : undefined;
  return {
    code: body.code,
    detail: body.detail,
    ...(labels?.length ? { invalidSpeakerLabels: labels } : {}),
    ...(revision !== undefined ? { currentRevision: revision } : {}),
  };
}

async function aiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await readmatesFetchResponse(path, init);
  if (!response.ok) {
    let problem: AiGenerationProblem | null = null;
    try {
      problem = parseAiProblem(await response.clone().json(), response.status);
    } catch {
      // Untrusted or non-JSON upstream errors use the content-free fallback.
    }
    throw new AiGenerationApiError(response.status, problem ?? GENERIC_AI_PROBLEM);
  }
  return parseReadmatesResponse<T>(response);
}

function sanitizeJob(response: AiGenerationJobResponse): AiGenerationJobResponse {
  const grounded =
    response.revision !== undefined ||
    response.groundingStatus !== undefined ||
    response.evidence !== undefined ||
    response.sectionReviewStatuses !== undefined;
  if (!grounded) return response;
  const complete =
    response.status === "SUCCEEDED" &&
    Number.isSafeInteger(response.revision) &&
    response.groundingStatus === "VALID" &&
    response.result !== null &&
    Array.isArray(response.evidence);
  if (complete) return response;
  return { ...response, result: null, evidence: null, sectionReviewStatuses: null };
}

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
  const body: StartGenerationBody = {};
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
  return aiFetch<StartGenerationResponse>(sessionsPath(sessionId, "/jobs"), {
    method: "POST",
    body: form,
  });
}

export async function getJob(
  sessionId: string,
  jobId: string,
): Promise<AiGenerationJobResponse> {
  return sanitizeJob(await aiFetch<AiGenerationJobResponse>(jobPath(sessionId, jobId)));
}

export function getAvailableModels(
  sessionId: string,
): Promise<AvailableGenerationModelsResponse> {
  return aiFetch<AvailableGenerationModelsResponse>(sessionsPath(sessionId, "/models"));
}

export function expandEvidence(
  sessionId: string,
  jobId: string,
  turnId: string,
  revision: number,
): Promise<ExpandedEvidenceTurn> {
  const suffix = `/evidence/${encodeURIComponent(turnId)}?revision=${encodeURIComponent(revision)}`;
  return aiFetch<ExpandedEvidenceTurn>(jobPath(sessionId, jobId, suffix));
}

export async function getRecentJob(sessionId: string): Promise<AiRecentJobResponse | null> {
  const result = await aiFetch<AiRecentJobResponse | null | undefined>(
    sessionsPath(sessionId, "/jobs/recent"),
  );
  return result ?? null;
}

export function regenerateItem(
  sessionId: string,
  jobId: string,
  request: RegenerateRequest,
): Promise<RegenerateResponse> {
  return aiFetch<RegenerateResponse>(jobPath(sessionId, jobId, "/regenerate"), {
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
  return aiFetch<AiCommitResponse>(jobPath(sessionId, jobId, "/commit"), {
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
