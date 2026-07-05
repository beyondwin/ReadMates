import type {
  CreateHostInvitationRequest,
  HostInvitationListPage,
  HostInvitationResponse,
} from "@/features/host/model/host-view-types";
import type { PageRequest } from "@/shared/model/paging";

export type HostInvitationsActions = {
  listInvitations: (page?: PageRequest) => Promise<Response>;
  refreshInvitations: (page?: PageRequest) => Promise<HostInvitationListPage>;
  createInvitation: (request: CreateHostInvitationRequest) => Promise<Response>;
  revokeInvitation: (invitationId: string) => Promise<Response>;
  parseInvitation: (response: Response) => Promise<HostInvitationResponse>;
  parseInvitationList: (response: Response) => Promise<HostInvitationListPage>;
};
