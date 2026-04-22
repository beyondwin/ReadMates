import {
  type CreateInvitationRequest,
  type HostInvitationListItem,
  type HostInvitationResponse,
  readmatesFetchResponse,
} from "@/shared/api/readmates";

type CreateHostInvitationRequest = CreateInvitationRequest & {
  applyToCurrentSession?: boolean;
};

export async function listInvitations() {
  return readmatesFetchResponse("/api/host/invitations");
}

export async function createInvitation(request: CreateHostInvitationRequest) {
  return readmatesFetchResponse("/api/host/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function revokeInvitation(invitationId: string) {
  return readmatesFetchResponse(`/api/host/invitations/${encodeURIComponent(invitationId)}/revoke`, {
    method: "POST",
  });
}

export async function parseHostInvitationResponse(response: Response): Promise<HostInvitationResponse> {
  return (await response.json()) as HostInvitationResponse;
}

export async function parseHostInvitationListResponse(response: Response): Promise<HostInvitationListItem[]> {
  return (await response.json()) as HostInvitationListItem[];
}
