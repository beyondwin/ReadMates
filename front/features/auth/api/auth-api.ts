import type { DevLoginRequest, InvitationPreviewResponse } from "@/features/auth/api/auth-contracts";
import {
  readmatesApiPath,
  readmatesFetchResponse,
  type ReadmatesApiContext,
} from "@/shared/api/client";

function readmatesFetchRawResponse(path: string, init?: RequestInit, context?: ReadmatesApiContext) {
  const headers = new Headers(init?.headers);
  const bodyIsFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!headers.has("Content-Type") && !bodyIsFormData) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`/api/bff${readmatesApiPath(path, context)}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function submitDevLogin(email: string): Promise<Response> {
  const body: DevLoginRequest = { email };

  return readmatesFetchResponse("/api/dev/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchInvitationPreview(token: string, clubSlug?: string): Promise<Response> {
  if (clubSlug) {
    return readmatesFetchRawResponse(
      `/api/clubs/${encodeURIComponent(clubSlug)}/invitations/${encodeURIComponent(token)}`,
      undefined,
      { clubSlug: undefined },
    );
  }

  return readmatesFetchRawResponse(`/api/invitations/${encodeURIComponent(token)}`, undefined, {
    clubSlug: undefined,
  });
}

export async function parseInvitationPreview(response: Response): Promise<InvitationPreviewResponse> {
  return (await response.json()) as InvitationPreviewResponse;
}

export function logout() {
  return readmatesFetchRawResponse("/api/auth/logout", { method: "POST" });
}
