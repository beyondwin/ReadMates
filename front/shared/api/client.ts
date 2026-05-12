import { apiErrorFromResponse } from "@/shared/api/errors";
import { parseReadmatesResponse } from "@/shared/api/response";
import { currentRelativeReturnTo, loginPathForReturnTo } from "@/shared/auth/login-return";

export class ReadMatesSessionExpiredError extends Error {
  constructor() {
    super("ReadMatesSessionExpiredError");
    this.name = "ReadMatesSessionExpiredError";
  }
}

let lastLoginRedirectAt = 0;
const REDIRECT_COOL_OFF_MS = 1500;

export function __resetRedirectGuardForTest() {
  lastLoginRedirectAt = 0;
}

export type ReadmatesApiContext = {
  clubSlug?: string;
};

function currentAppClubSlug() {
  if (typeof globalThis.location?.pathname !== "string") {
    return null;
  }

  const match = /^\/clubs\/([^/]+)\/app(?:\/|$)/.exec(globalThis.location.pathname);
  return match?.[1] ?? null;
}

export function readmatesApiPath(path: string, context?: ReadmatesApiContext) {
  const clubSlug =
    context && Object.prototype.hasOwnProperty.call(context, "clubSlug")
      ? context.clubSlug
      : currentAppClubSlug();
  if (!clubSlug || !path.startsWith("/api/")) {
    return path;
  }

  const url = new URL(path, "https://readmates.local");
  if (!url.searchParams.has("clubSlug")) {
    url.searchParams.set("clubSlug", clubSlug);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export async function readmatesFetchResponse(path: string, init?: RequestInit, context?: ReadmatesApiContext): Promise<Response> {
  const headers = new Headers(init?.headers);
  const bodyIsFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!headers.has("Content-Type") && !bodyIsFormData) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api/bff${readmatesApiPath(path, context)}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (response.status === 401) {
    const now = Date.now();
    const inCoolOff = now - lastLoginRedirectAt < REDIRECT_COOL_OFF_MS;
    if (typeof window !== "undefined" && !inCoolOff) {
      lastLoginRedirectAt = now;
      window.location.assign(loginPathForReturnTo(currentRelativeReturnTo()));
    }
    throw new ReadMatesSessionExpiredError();
  }

  return response;
}

export async function readmatesFetch<T>(path: string, init?: RequestInit, context?: ReadmatesApiContext): Promise<T> {
  const response = await readmatesFetchResponse(path, init, context);

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  return parseReadmatesResponse<T>(response);
}
