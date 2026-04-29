import { apiErrorFromResponse } from "@/shared/api/errors";
import { parseReadmatesResponse } from "@/shared/api/response";

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
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
    throw new Error("ReadMates session expired");
  }

  return response;
}

export async function readmatesFetch<T>(path: string, init?: RequestInit, context?: ReadmatesApiContext): Promise<T> {
  const response = await readmatesFetchResponse(path, init, context);

  if (!response.ok) {
    throw apiErrorFromResponse(response);
  }

  return parseReadmatesResponse<T>(response);
}
