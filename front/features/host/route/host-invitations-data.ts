import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import {
  createHostInvitation,
  fetchHostInvitations,
  listHostInvitationsResponse,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  revokeHostInvitation,
} from "@/features/host/api/host-api";
import type { HostInvitationsActions } from "@/features/host/model/host-invitation-actions";
import { hostInvitationListQuery, invalidateHostInvitations } from "@/features/host/queries/host-invitation-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";

const HOST_INVITATIONS_PAGE_LIMIT = 50;

export function hostInvitationsLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs) => {
    await requireHostLoaderAuth(args);

    const context = requireHostClubContext(clubSlugFromLoaderArgs(args));
    const page = await fetchHostInvitations(
      context,
      { limit: HOST_INVITATIONS_PAGE_LIMIT },
    );

    client.setQueryData(
      hostInvitationListQuery({ limit: HOST_INVITATIONS_PAGE_LIMIT }, context).queryKey,
      page,
    );

    return page;
  };
}

export function createHostInvitationsActions(
  client: QueryClient,
  context: { clubSlug: string },
): HostInvitationsActions {
  const refreshInvitations = async (page: Parameters<HostInvitationsActions["refreshInvitations"]>[0]) => {
    await invalidateHostInvitations(client, context);
    return client.fetchQuery(hostInvitationListQuery(page, context));
  };

  return {
    listInvitations: (page) => listHostInvitationsResponse(context, page),
    refreshInvitations,
    createInvitation: (request) => createHostInvitation(request, context),
    revokeInvitation: (invitationId) => revokeHostInvitation(invitationId, context),
    parseInvitation: parseHostInvitationResponse,
    parseInvitationList: parseHostInvitationListResponse,
  };
}
