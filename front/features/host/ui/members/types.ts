import type { ComponentType, ReactNode } from "react";
import type {
  HostMemberLifecyclePath as ModelHostMemberLifecyclePath,
  HostViewerAction as ModelHostViewerAction,
} from "@/features/host/model/host-member-actions";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";

export type HostMembersLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};
export type HostMembersLinkComponent = ComponentType<HostMembersLinkProps>;

export type HostMemberLifecyclePath = ModelHostMemberLifecyclePath;
export type HostViewerAction = ModelHostViewerAction;
export type MemberTab = "active" | "viewer" | "suspended" | "inactive" | "invitations";
export type LifecycleDialog = null | { action: "suspend" | "deactivate"; member: HostMemberListItem };
export type ProfileDialog = null | { member: HostMemberListItem };
