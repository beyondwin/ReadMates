import type {
  HostSessionVisibilityRequest,
  HostSessionListPage,
} from "@/features/host/api/host-contracts";
import type { PageRequest } from "@/shared/model/paging";

export type HostDashboardMissingMemberAction = "add" | "remove";

export type HostDashboardActions = {
  updateCurrentSessionParticipation: (
    membershipId: string,
    action: HostDashboardMissingMemberAction,
  ) => Promise<void>;
  updateSessionVisibility: (sessionId: string, request: HostSessionVisibilityRequest) => Promise<void>;
  openSession: (sessionId: string) => Promise<void>;
  loadHostSessions: (page?: PageRequest) => Promise<HostSessionListPage>;
};
