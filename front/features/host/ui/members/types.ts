import type { ComponentType, ReactNode } from "react";
import type { HostMemberListItem } from "@/features/host/ui/host-ui-types";

export type HostMembersLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};
export type HostMembersLinkComponent = ComponentType<HostMembersLinkProps>;

export type HostMemberLifecyclePath = "/suspend" | "/deactivate" | "/restore" | "/current-session/add" | "/current-session/remove";
export type HostViewerAction = "activate" | "deactivate-viewer";
export type MemberTab = "active" | "viewer" | "suspended" | "inactive" | "invitations";
export type LifecycleDialog = null | { action: "suspend" | "deactivate"; member: HostMemberListItem };
export type ProfileDialog = null | { member: HostMemberListItem };
