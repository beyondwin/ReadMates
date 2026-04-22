import {
  createHostInvitation,
  fetchHostInvitations,
  listHostInvitationsResponse,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  revokeHostInvitation,
} from "@/features/host/api/host-api";
import type { HostInvitationsActions } from "@/features/host/components/host-invitations";
import { requireHostLoaderAuth } from "./host-loader-auth";

export async function hostInvitationsLoader() {
  await requireHostLoaderAuth();

  return fetchHostInvitations();
}

export const hostInvitationsActions = {
  listInvitations: listHostInvitationsResponse,
  createInvitation: createHostInvitation,
  revokeInvitation: revokeHostInvitation,
  parseInvitation: parseHostInvitationResponse,
  parseInvitationList: parseHostInvitationListResponse,
} satisfies HostInvitationsActions;
