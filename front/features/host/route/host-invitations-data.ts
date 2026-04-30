import {
  createHostInvitation,
  fetchHostInvitations,
  listHostInvitationsResponse,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  revokeHostInvitation,
} from "@/features/host/api/host-api";
import type { HostInvitationsActions } from "@/features/host/components/host-invitations";
import type { LoaderFunctionArgs } from "react-router-dom";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export async function hostInvitationsLoader(args?: LoaderFunctionArgs) {
  await requireHostLoaderAuth(args);

  return fetchHostInvitations({ clubSlug: clubSlugFromLoaderArgs(args) });
}

export const hostInvitationsActions = {
  listInvitations: (page) => listHostInvitationsResponse(undefined, page),
  createInvitation: createHostInvitation,
  revokeInvitation: revokeHostInvitation,
  parseInvitation: parseHostInvitationResponse,
  parseInvitationList: parseHostInvitationListResponse,
} satisfies HostInvitationsActions;
