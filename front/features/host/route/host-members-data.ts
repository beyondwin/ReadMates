import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
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

const HOST_MEMBERS_PAGE_LIMIT = 50;

function normalizeMemberPage(value: HostMemberListPage | HostMemberListItem[]): HostMemberListPage {
  return Array.isArray(value) ? { items: value, nextCursor: null } : value;
}

export function hostMembersLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs) => {
    await requireHostLoaderAuth(args);

    const raw = await fetchHostMembers(
      { clubSlug: clubSlugFromLoaderArgs(args) },
      { limit: HOST_MEMBERS_PAGE_LIMIT },
    );
    const page = normalizeMemberPage(raw);

    client.setQueryData(
      hostMemberListQuery({ limit: HOST_MEMBERS_PAGE_LIMIT }).queryKey,
      page,
    );

    return page;
  };
}

export function createHostMembersActions(client: QueryClient): HostMembersActions {
  const markMembersStale = () => invalidateHostMembers(client);
  const refreshMembers = async () => {
    await client.fetchQuery(hostMemberListQuery({ limit: HOST_MEMBERS_PAGE_LIMIT }));
    await markMembersStale();
  };

  return {
    loadMembers: (page) => fetchHostMembers(undefined, page),
    refreshMembers,
    submitLifecycle: async (membershipId, path, body) => {
      const response = await submitHostMemberLifecycle(membershipId, path, body);
      if (response.ok) {
        await markMembersStale();
      }
      return response;
    },
    submitProfile: async (membershipId, displayName) => {
      const response = await submitHostMemberProfile(membershipId, displayName);
      if (response.ok) {
        await markMembersStale();
      }
      return response;
    },
    submitViewerAction: submitHostViewerAction,
  };
}
