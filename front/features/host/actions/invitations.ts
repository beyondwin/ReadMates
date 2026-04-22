import {
  createHostInvitation,
  listHostInvitationsResponse,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  revokeHostInvitation,
} from "@/features/host/api/host-api";
import type { CreateHostInvitationRequest } from "@/features/host/api/host-contracts";

export async function listInvitations() {
  return listHostInvitationsResponse();
}

export async function createInvitation(request: CreateHostInvitationRequest) {
  return createHostInvitation(request);
}

export async function revokeInvitation(invitationId: string) {
  return revokeHostInvitation(invitationId);
}

export { parseHostInvitationListResponse, parseHostInvitationResponse };
