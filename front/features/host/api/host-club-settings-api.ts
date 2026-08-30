import { readmatesFetch, type ExplicitReadmatesApiContext } from "@/shared/api/client";
import { pagingSearchParams, type PageRequest } from "@/shared/model/paging";
import { HostClubClosePreviewSchema, HostClubCloseResultSchema, HostClubSettingsHistorySchema, HostClubSettingsMutationResultSchema, HostClubSettingsSchema, HostCoHostMutationResultSchema, type UpdateHostClubSettingsRequest } from "./host-club-settings-contracts";

const json = (body: unknown, method = "POST"): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const fetchHostClubSettings = (context: ExplicitReadmatesApiContext) => readmatesFetch("/api/host/club-settings", undefined, context).then(HostClubSettingsSchema.parse);
export const updateHostClubSettings = (request: UpdateHostClubSettingsRequest, context: ExplicitReadmatesApiContext) => readmatesFetch("/api/host/club-settings", json(request, "PUT"), context).then(HostClubSettingsMutationResultSchema.parse);
export const changeHostCoHost = (membershipId: string, action: "promote" | "demote", request: { expectedRevision: number; idempotencyKey: string }, context: ExplicitReadmatesApiContext) => readmatesFetch(`/api/host/club-settings/co-hosts/${encodeURIComponent(membershipId)}/${action}`, json(request), context).then(HostCoHostMutationResultSchema.parse);
export const fetchHostClubSettingsHistory = (context: ExplicitReadmatesApiContext, page?: PageRequest) => readmatesFetch(`/api/host/club-settings/history${pagingSearchParams(page)}`, undefined, context).then(HostClubSettingsHistorySchema.parse);
export const previewHostClubClose = (context: ExplicitReadmatesApiContext) => readmatesFetch("/api/host/club-settings/end/preview", { method: "POST" }, context).then(HostClubClosePreviewSchema.parse);
export const confirmHostClubClose = (request: { previewId: string; effectHash: string; idempotencyKey: string }, context: ExplicitReadmatesApiContext) => readmatesFetch("/api/host/club-settings/end/confirm", json(request), context).then(HostClubCloseResultSchema.parse);
