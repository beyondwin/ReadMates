import type { InvitationPreviewResponse } from "@/shared/api/readmates";

export async function fetchInvitationPreview(token: string): Promise<Response> {
  return fetch(`/api/bff/api/invitations/${encodeURIComponent(token)}`);
}

export async function acceptInvitationWithDevShortcut(token: string): Promise<Response> {
  return fetch(`/api/bff/api/dev/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
  });
}

export async function parseInvitationPreview(response: Response): Promise<InvitationPreviewResponse> {
  return (await response.json()) as InvitationPreviewResponse;
}
