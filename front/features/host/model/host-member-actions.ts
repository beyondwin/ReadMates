import type {
  HostMemberProfileResponse,
  HostMemberProfileErrorCode,
  HostMemberListPage,
  MemberLifecycleRequest,
  MemberLifecycleResponse,
  ViewerMember,
} from "@/features/host/model/host-view-types";
import type { PageRequest } from "@/shared/model/paging";

export type HostMemberLifecyclePath =
  "/suspend" | "/deactivate" | "/restore" | "/current-session/add" | "/current-session/remove";
export type HostViewerAction = "activate" | "deactivate-viewer";

export class HostMemberProfileActionError extends Error {
  constructor(
    readonly status: number,
    readonly code: HostMemberProfileErrorCode | null,
  ) {
    super("HOST_MEMBER_PROFILE_ACTION_FAILED");
    this.name = "HostMemberProfileActionError";
  }
}

export type HostMembersActions = {
  loadMembers: (page?: PageRequest) => Promise<HostMemberListPage>;
  refreshMembers: () => Promise<HostMemberListPage>;
  submitLifecycle: (
    membershipId: string,
    path: HostMemberLifecyclePath,
    body?: MemberLifecycleRequest,
  ) => Promise<MemberLifecycleResponse>;
  submitProfile: (membershipId: string, displayName: string) => Promise<HostMemberProfileResponse>;
  submitViewerAction: (membershipId: string, action: HostViewerAction) => Promise<ViewerMember>;
};
