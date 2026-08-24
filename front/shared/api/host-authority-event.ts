import { apiErrorFromResponse, type ReadmatesApiError } from "./errors";

export const HOST_SECURITY_PURGE_CODES = [
  "HOST_AUTHORITY_REVOKED",
  "MEMBERSHIP_SUSPENDED",
  "CROSS_CLUB_SCOPE",
] as const;

export type HostSecurityPurgeCode = (typeof HOST_SECURITY_PURGE_CODES)[number];

export type HostAuthorityLossEvent = {
  code: HostSecurityPurgeCode;
  clubSlug: string;
  requestKind: string;
};

export type HostApiErrorContext = {
  clubSlug: string;
  requestKind: string;
};

type HostAuthorityLossListener = (event: HostAuthorityLossEvent) => void;

const listeners = new Set<HostAuthorityLossListener>();
const requestsByClub = new Map<string, Set<AbortController>>();
const requestGenerationByClub = new Map<string, number>();
const responseLeases = new WeakMap<Response, {
  clubSlug: string;
  generation: number;
  release: () => void;
}>();

export class HostRequestPurgedError extends Error {
  readonly code = "HOST_REQUEST_PURGED";

  constructor() {
    super("호스트 권한 변경으로 진행 중인 요청을 중단했습니다.");
    this.name = "HostRequestPurgedError";
  }
}

export function isHostSecurityPurgeCode(code: string): code is HostSecurityPurgeCode {
  return (HOST_SECURITY_PURGE_CODES as readonly string[]).includes(code);
}

export function subscribeHostAuthorityLoss(listener: HostAuthorityLossListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function signalHostAuthorityLoss(event: HostAuthorityLossEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function registerHostRequest(
  clubSlug: string,
  controller: AbortController,
): () => void {
  const requests = requestsByClub.get(clubSlug) ?? new Set<AbortController>();
  requests.add(controller);
  requestsByClub.set(clubSlug, requests);
  return () => {
    requests.delete(controller);
    if (requests.size === 0) requestsByClub.delete(clubSlug);
  };
}

export function hostRequestGeneration(clubSlug: string): number {
  return requestGenerationByClub.get(clubSlug) ?? 0;
}

export function registerHostResponseLease(
  response: Response,
  input: { clubSlug: string; generation: number; release: () => void },
): void {
  responseLeases.set(response, input);
  if (response.body === null) releaseHostResponse(response);
}

export function releaseHostResponse(response: Response): void {
  const lease = responseLeases.get(response);
  if (!lease) return;
  responseLeases.delete(response);
  lease.release();
}

export function assertHostResponseActive(response: Response): void {
  const lease = responseLeases.get(response);
  if (!lease) return;
  if (hostRequestGeneration(lease.clubSlug) !== lease.generation) {
    throw new HostRequestPurgedError();
  }
}

export async function readHostResponseJson<T = unknown>(response: Response): Promise<T> {
  try {
    if (response.status === 204) {
      assertHostResponseActive(response);
      return undefined as T;
    }
    const value = await response.json() as T;
    assertHostResponseActive(response);
    return value;
  } finally {
    releaseHostResponse(response);
  }
}

export async function completeHostResponseBody(response: Response): Promise<Response> {
  try {
    if (response.body !== null) await response.clone().arrayBuffer();
    assertHostResponseActive(response);
    return response;
  } finally {
    releaseHostResponse(response);
  }
}

export function cancelClubHostRequests(clubSlug: string): void {
  requestGenerationByClub.set(clubSlug, hostRequestGeneration(clubSlug) + 1);
  const requests = requestsByClub.get(clubSlug);
  requestsByClub.delete(clubSlug);
  for (const controller of requests ?? []) controller.abort();
}

export async function hostApiErrorFromResponse(
  response: Response,
  context: HostApiErrorContext,
): Promise<ReadmatesApiError> {
  try {
    const error = await apiErrorFromResponse(response);
    assertHostResponseActive(response);
    if (isHostSecurityPurgeCode(error.code)) {
      signalHostAuthorityLoss({
        code: error.code,
        clubSlug: context.clubSlug,
        requestKind: context.requestKind,
      });
    }
    return error;
  } finally {
    releaseHostResponse(response);
  }
}
