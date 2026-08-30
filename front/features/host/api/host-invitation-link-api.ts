import { readmatesFetch, type ExplicitReadmatesApiContext } from "@/shared/api/client";
import { pagingSearchParams, type PageRequest } from "@/shared/model/paging";
import {
  HostInvitationLinkCreateResultSchema, HostInvitationLinkHistorySchema, HostInvitationLinkListSchema,
  HostInvitationLinkUpdateResultSchema, type CreateHostInvitationLinkRequest, type UpdateHostInvitationLinkRequest,
} from "./host-invitation-link-contracts";

export const fetchHostInvitationLinks = (context: ExplicitReadmatesApiContext, page?: PageRequest) =>
  readmatesFetch(`/api/host/invitation-links${pagingSearchParams(page)}`, undefined, context).then(HostInvitationLinkListSchema.parse);

export const createHostInvitationLink = (request: CreateHostInvitationLinkRequest, context: ExplicitReadmatesApiContext) =>
  readmatesFetch("/api/host/invitation-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }, context).then(HostInvitationLinkCreateResultSchema.parse);

export const updateHostInvitationLink = (linkId: string, request: UpdateHostInvitationLinkRequest, context: ExplicitReadmatesApiContext) =>
  readmatesFetch(`/api/host/invitation-links/${encodeURIComponent(linkId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }, context).then(HostInvitationLinkUpdateResultSchema.parse);

export const fetchHostInvitationLinkHistory = (linkId: string, context: ExplicitReadmatesApiContext, page?: PageRequest) =>
  readmatesFetch(`/api/host/invitation-links/${encodeURIComponent(linkId)}/history${pagingSearchParams(page)}`, undefined, context).then(HostInvitationLinkHistorySchema.parse);
