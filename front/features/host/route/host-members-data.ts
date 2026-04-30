import {
  fetchHostMembers,
  submitHostMemberLifecycle,
  submitHostMemberProfile,
  submitHostViewerAction,
} from "@/features/host/api/host-api";
import type { HostMembersActions } from "@/features/host/components/host-members";
import type { LoaderFunctionArgs } from "react-router-dom";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export async function hostMembersLoader(args?: LoaderFunctionArgs) {
  await requireHostLoaderAuth(args);

  return fetchHostMembers({ clubSlug: clubSlugFromLoaderArgs(args) });
}

export const hostMembersActions = {
  loadMembers: (page) => fetchHostMembers(undefined, page),
  submitLifecycle: submitHostMemberLifecycle,
  submitProfile: submitHostMemberProfile,
  submitViewerAction: submitHostViewerAction,
} satisfies HostMembersActions;
