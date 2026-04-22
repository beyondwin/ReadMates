import { useLoaderData } from "react-router-dom";
import {
  createHostInvitation,
  fetchHostInvitations,
  listHostInvitationsResponse,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  revokeHostInvitation,
} from "@/features/host/api/host-api";
import type { HostInvitationListItem } from "@/features/host/api/host-contracts";
import HostInvitations, { type HostInvitationsActions } from "@/features/host/components/host-invitations";

export function hostInvitationsLoader() {
  return fetchHostInvitations();
}

const hostInvitationsActions = {
  listInvitations: listHostInvitationsResponse,
  createInvitation: createHostInvitation,
  revokeInvitation: revokeHostInvitation,
  parseInvitation: parseHostInvitationResponse,
  parseInvitationList: parseHostInvitationListResponse,
} satisfies HostInvitationsActions;

export function HostInvitationsRoute() {
  const invitations = useLoaderData() as HostInvitationListItem[];

  return <HostInvitations initialInvitations={invitations} actions={hostInvitationsActions} />;
}
