import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { ReadmatesReturnState } from "@/shared/routing/readmates-route-state";
import type {
  HostDashboardResponse,
  HostSessionListPage,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import type { PageRequest } from "@/shared/model/paging";

export type HostDashboardLinkProps = {
  to: string;
  state?: ReadmatesReturnState;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  style?: CSSProperties;
};

export type HostDashboardLinkComponent = ComponentType<HostDashboardLinkProps>;

export type UpcomingActionKind = "visibility" | "open";

export type UpcomingActionHandlers = {
  updateVisibility: (sessionId: string, visibility: SessionRecordVisibility) => Promise<void>;
  openSession: (sessionId: string) => Promise<void>;
  isPending: (sessionId: string, action: UpcomingActionKind) => boolean;
  isBusy: boolean;
  canOpenSession: boolean;
};

export type QuickActionIcon = "notes" | "edit" | "check";

export type HostDashboardMissingMemberAction = "add" | "remove";

export type MissingCurrentSessionMember = NonNullable<HostDashboardResponse["currentSessionMissingMembers"]>[number];

export type HostDashboardActions = {
  updateCurrentSessionParticipation: (
    membershipId: string,
    action: HostDashboardMissingMemberAction,
  ) => Promise<void>;
  updateSessionVisibility: (sessionId: string, visibility: SessionRecordVisibility) => Promise<void>;
  openSession: (sessionId: string) => Promise<void>;
  loadHostSessions: (page?: PageRequest) => Promise<HostSessionListPage>;
};
