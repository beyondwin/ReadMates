import type {
  HostSessionListPage,
  SessionRecordVisibility,
} from "@/features/host/api/host-contracts";
import type { PageRequest } from "@/shared/model/paging";

export type HostDashboardMissingMemberAction = "add" | "remove";

export type HostDashboardActions = {
  updateCurrentSessionParticipation: (
    membershipId: string,
    action: HostDashboardMissingMemberAction,
  ) => Promise<void>;
  updateSessionVisibility: (sessionId: string, visibility: SessionRecordVisibility) => Promise<void>;
  openSession: (sessionId: string) => Promise<void>;
  loadHostSessions: (page?: PageRequest) => Promise<HostSessionListPage>;
};
