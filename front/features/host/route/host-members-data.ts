import {
  fetchHostMembers,
  submitHostMemberLifecycle,
  submitHostViewerAction,
} from "@/features/host/api/host-api";
import type { HostMembersActions } from "@/features/host/components/host-members";
import { requireHostLoaderAuth } from "./host-loader-auth";

export async function hostMembersLoader() {
  await requireHostLoaderAuth();

  return fetchHostMembers();
}

export const hostMembersActions = {
  loadMembers: fetchHostMembers,
  submitLifecycle: submitHostMemberLifecycle,
  submitViewerAction: submitHostViewerAction,
} satisfies HostMembersActions;
