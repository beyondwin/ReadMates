import type { HostSessionListPage } from "@/features/host/api/host-contracts";
import type { SessionAccessScope } from "@/features/host/model/session-exposure-model";
import type { PageRequest } from "@/shared/model/paging";

export type HostDashboardMissingMemberAction = "add" | "remove";

export type HostDashboardActions = {
  updateCurrentSessionParticipation: (
    membershipId: string,
    action: HostDashboardMissingMemberAction,
  ) => Promise<void>;
  updateSessionAccessScope: (sessionId: string, request: { accessScope: SessionAccessScope }) => Promise<void>;
  openSession: (sessionId: string) => Promise<void>;
  loadHostSessions: (page?: PageRequest) => Promise<HostSessionListPage>;
};
