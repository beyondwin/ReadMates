import { apiErrorFromResponse } from "@/shared/api/errors";
import { parseReadmatesResponse } from "@/shared/api/response";

export async function readmatesFetchResponse(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const bodyIsFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!headers.has("Content-Type") && !bodyIsFormData) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api/bff${path}`, {
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

export async function readmatesFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await readmatesFetchResponse(path, init);

  if (!response.ok) {
    throw apiErrorFromResponse(response);
  }

  return parseReadmatesResponse<T>(response);
}
