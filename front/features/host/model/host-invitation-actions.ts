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

export type HostInvitationCreatePublication = {
  created: HostInvitationResponse;
  refreshed: HostInvitationListPage;
};

export type HostInvitationRevokePublication = {
  revoked: HostInvitationResponse;
  refreshed: HostInvitationListPage;
};

export type OwnerFencedInvitationResult<T> = T & {
  publishUi: (publish: (result: T) => void) => "published" | "rejected";
};

export type OwnerFencedInvitationError = Error & {
  status?: number;
  publishUi: (publish: (error: OwnerFencedInvitationError) => void) => "published" | "rejected";
};

export function isOwnerFencedInvitationError(error: unknown): error is OwnerFencedInvitationError {
  return error instanceof Error && typeof (error as Partial<OwnerFencedInvitationError>).publishUi === "function";
}

export type RegisteredHostInvitationsActions = Pick<HostInvitationsActions, "listInvitations" | "parseInvitationList"> & {
  createInvitation: (request: CreateHostInvitationRequest) => Promise<OwnerFencedInvitationResult<HostInvitationCreatePublication>>;
  revokeInvitation: (invitationId: string) => Promise<OwnerFencedInvitationResult<HostInvitationRevokePublication>>;
};
