import {
  createHostInvitation,
  listHostInvitationsResponse,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  revokeHostInvitation,
} from "@/features/host/api/host-api";
import type { CreateHostInvitationRequest } from "@/features/host/api/host-contracts";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";

export async function listInvitations(context: ExplicitReadmatesApiContext) {
  return listHostInvitationsResponse(context);
}

export async function createInvitation(
  request: CreateHostInvitationRequest,
  context: ExplicitReadmatesApiContext,
) {
  return createHostInvitation(request, context);
}

export async function revokeInvitation(invitationId: string, context: ExplicitReadmatesApiContext) {
  return revokeHostInvitation(invitationId, context);
}

export { parseHostInvitationListResponse, parseHostInvitationResponse };
