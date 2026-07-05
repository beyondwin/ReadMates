import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
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

const HOST_INVITATIONS_PAGE_LIMIT = 50;

export function hostInvitationsLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs) => {
    await requireHostLoaderAuth(args);

    const page = await fetchHostInvitations(
      { clubSlug: clubSlugFromLoaderArgs(args) },
      { limit: HOST_INVITATIONS_PAGE_LIMIT },
    );

    client.setQueryData(
      hostInvitationListQuery({ limit: HOST_INVITATIONS_PAGE_LIMIT }).queryKey,
      page,
    );

    return page;
  };
}

export function createHostInvitationsActions(client: QueryClient): HostInvitationsActions {
  const refreshInvitations = async (page: Parameters<HostInvitationsActions["refreshInvitations"]>[0]) => {
    const nextPage = await client.fetchQuery(hostInvitationListQuery(page));
    await invalidateHostInvitations(client);
    return nextPage;
  };

  return {
    listInvitations: (page) => listHostInvitationsResponse(undefined, page),
    refreshInvitations,
    createInvitation: createHostInvitation,
    revokeInvitation: revokeHostInvitation,
    parseInvitation: parseHostInvitationResponse,
    parseInvitationList: parseHostInvitationListResponse,
  };
}
