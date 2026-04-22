import type { DevLoginRequest, InvitationPreviewResponse } from "@/features/auth/api/auth-contracts";

export async function submitDevLogin(email: string): Promise<Response> {
  const body: DevLoginRequest = { email };

  return fetch("/api/bff/api/dev/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchInvitationPreview(token: string): Promise<Response> {
  return fetch(`/api/bff/api/invitations/${encodeURIComponent(token)}`);
}

export async function parseInvitationPreview(response: Response): Promise<InvitationPreviewResponse> {
  return (await response.json()) as InvitationPreviewResponse;
}

export function logout() {
  return fetch("/api/bff/api/auth/logout", { method: "POST" });
}
