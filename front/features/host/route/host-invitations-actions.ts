import type {
  CreateHostInvitationRequest,
  HostInvitationListPage,
  HostInvitationResponse,
} from "@/features/host/api/host-contracts";
import type { PageRequest } from "@/shared/model/paging";

export type HostInvitationsActions = {
  listInvitations: (page?: PageRequest) => Promise<Response>;
  createInvitation: (request: CreateHostInvitationRequest) => Promise<Response>;
  revokeInvitation: (invitationId: string) => Promise<Response>;
  parseInvitation: (response: Response) => Promise<HostInvitationResponse>;
  parseInvitationList: (response: Response) => Promise<HostInvitationListPage>;
};
