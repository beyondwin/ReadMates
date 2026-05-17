import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  fetchHostMembers,
  submitHostMemberLifecycle,
  submitHostMemberProfile,
  submitHostViewerAction,
} from "@/features/host/api/host-api";
import type { HostMemberListItem, HostMemberListPage } from "@/features/host/api/host-contracts";
import { hostMemberListQuery } from "@/features/host/queries/host-members-queries";
import type { HostMembersActions } from "@/features/host/route/host-members-actions";
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

export const hostMembersActions = {
  loadMembers: (page) => fetchHostMembers(undefined, page),
  submitLifecycle: submitHostMemberLifecycle,
  submitProfile: submitHostMemberProfile,
  submitViewerAction: submitHostViewerAction,
} satisfies HostMembersActions;
