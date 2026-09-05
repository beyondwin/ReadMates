import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import {
  fetchHostMembers,
  submitHostMemberLifecycle,
  submitHostMemberProfile,
  submitHostViewerAction,
} from "@/features/host/api/host-api";
import type {
  HostMemberListItem,
  HostMemberListPage,
} from "@/features/host/api/host-contracts";
import {
  HostMemberProfileActionError,
  type HostMembersActions,
} from "@/features/host/model/host-member-actions";
import type { HostMemberProfileErrorCode } from "@/features/host/model/host-view-types";
import { hostMemberListQuery, invalidateHostMembers } from "@/features/host/queries/host-members-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import {
  completeHostResponseBody,
  readHostResponseJson,
} from "@/shared/api/host-authority-event";

const HOST_MEMBERS_PAGE_LIMIT = 50;

export type HostMembersRouteData = {
  members: HostMemberListPage;
};

function normalizeMemberPage(value: HostMemberListPage | HostMemberListItem[]): HostMemberListPage {
  return Array.isArray(value) ? { items: value, nextCursor: null } : value;
}

export function hostMembersLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<HostMembersRouteData> => {
    await requireHostLoaderAuth(args);

    const context = requireHostClubContext(clubSlugFromLoaderArgs(args));
    const pageRequest = { limit: HOST_MEMBERS_PAGE_LIMIT };
    const members = normalizeMemberPage(await fetchHostMembers(context, pageRequest));

    client.setQueryData(hostMemberListQuery(pageRequest, context).queryKey, members);

    return { members };
  };
}

export function createHostMembersActions(
  client: QueryClient,
  context: { clubSlug: string },
): HostMembersActions {
  return {
    loadMembers: (page) => fetchHostMembers(context, page),
    refreshMembers: () => publishHostMembersRefresh(client, context),
    submitLifecycle: async (membershipId, path, body) => {
      const response = await submitHostMemberLifecycle(membershipId, path, body, context);
      if (!response.ok) {
        await completeHostResponseBody(response);
        throw new Error("HOST_MEMBER_LIFECYCLE_ACTION_FAILED");
      }
      const result = await readHostResponseJson(response);
      return result;
    },
    submitProfile: async (membershipId, displayName) => {
      const response = await submitHostMemberProfile(membershipId, displayName, context);
      if (!response.ok) {
        let code: HostMemberProfileErrorCode | null = null;
        try {
          const body = await readHostResponseJson<unknown>(response);
          if (typeof body === "object" && body !== null && "code" in body && typeof body.code === "string") {
            code = body.code as HostMemberProfileErrorCode;
          }
        } catch {
          // The UI only needs the stable status fallback when an error body is unavailable.
        }
        throw new HostMemberProfileActionError(response.status, code);
      }
      const member = await readHostResponseJson(response);
      return member;
    },
    submitViewerAction: (membershipId, action) => submitHostViewerAction(membershipId, action, context),
  };
}

/** Cache publication. A route owner may call this only after accepted settlement. */
export async function publishHostMembersRefresh(
  client: QueryClient,
  context: { clubSlug: string },
): Promise<HostMemberListPage> {
  const page = await fetchHostMembers(context, { limit: HOST_MEMBERS_PAGE_LIMIT });
  client.setQueryData(hostMemberListQuery({ limit: HOST_MEMBERS_PAGE_LIMIT }, context).queryKey, page);
  await invalidateHostMembers(client, context);
  return page;
}
