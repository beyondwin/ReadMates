import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import {
  fetchHostMembers,
  submitHostMemberLifecycle,
  submitHostMemberProfile,
  submitHostViewerAction,
} from "@/features/host/api/host-api";
import type { HostMemberListItem, HostMemberListPage } from "@/features/host/api/host-contracts";
import type { HostMembersActions } from "@/features/host/model/host-member-actions";
import { hostMemberListQuery, invalidateHostMembers } from "@/features/host/queries/host-members-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";

const HOST_MEMBERS_PAGE_LIMIT = 50;

function normalizeMemberPage(value: HostMemberListPage | HostMemberListItem[]): HostMemberListPage {
  return Array.isArray(value) ? { items: value, nextCursor: null } : value;
}

export function hostMembersLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs) => {
    await requireHostLoaderAuth(args);

    const context = requireHostClubContext(clubSlugFromLoaderArgs(args));
    const raw = await fetchHostMembers(
      context,
      { limit: HOST_MEMBERS_PAGE_LIMIT },
    );
    const page = normalizeMemberPage(raw);

    client.setQueryData(
      hostMemberListQuery({ limit: HOST_MEMBERS_PAGE_LIMIT }, context).queryKey,
      page,
    );

    return page;
  };
}

export function createHostMembersActions(
  client: QueryClient,
  context: { clubSlug: string },
): HostMembersActions {
  const markMembersStale = () => invalidateHostMembers(client, context);
  const refreshMembers = async () => {
    const page = await fetchHostMembers(context, { limit: HOST_MEMBERS_PAGE_LIMIT });
    client.setQueryData(hostMemberListQuery({ limit: HOST_MEMBERS_PAGE_LIMIT }, context).queryKey, page);
    await markMembersStale();
    return page;
  };

  return {
    loadMembers: (page) => fetchHostMembers(context, page),
    refreshMembers,
    submitLifecycle: async (membershipId, path, body) => {
      const response = await submitHostMemberLifecycle(membershipId, path, body, context);
      if (response.ok) {
        await markMembersStale();
      }
      return response;
    },
    submitProfile: async (membershipId, displayName) => {
      const response = await submitHostMemberProfile(membershipId, displayName, context);
      if (response.ok) {
        await markMembersStale();
      }
      return response;
    },
    submitViewerAction: (membershipId, action) => submitHostViewerAction(membershipId, action, context),
  };
}
