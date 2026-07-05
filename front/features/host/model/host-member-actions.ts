import type {
  HostMemberProfileResponse,
  HostMemberListPage,
  MemberLifecycleRequest,
  MemberLifecycleResponse,
  ViewerMember,
} from "@/features/host/model/host-view-types";
import type { PageRequest } from "@/shared/model/paging";

export type HostMemberLifecyclePath =
  "/suspend" | "/deactivate" | "/restore" | "/current-session/add" | "/current-session/remove";
export type HostViewerAction = "activate" | "deactivate-viewer";

export type JsonResponse<T> = Response & { json(): Promise<T> };

export type HostMembersActions = {
  loadMembers: (page?: PageRequest) => Promise<HostMemberListPage>;
  refreshMembers: () => Promise<HostMemberListPage>;
  submitLifecycle: (
    membershipId: string,
    path: HostMemberLifecyclePath,
    body?: MemberLifecycleRequest,
  ) => Promise<JsonResponse<MemberLifecycleResponse>>;
  submitProfile: (membershipId: string, displayName: string) => Promise<JsonResponse<HostMemberProfileResponse>>;
  submitViewerAction: (membershipId: string, action: HostViewerAction) => Promise<ViewerMember>;
};
