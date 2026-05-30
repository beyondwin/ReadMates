import type { PlatformAdminAiOpsFilters } from "@/features/platform-admin/api/platform-admin-contracts";

export type AiOpsJobFilter = {
  errorCode: string | null;
  clubId: string | null;
};

export const EMPTY_AI_OPS_FILTER: AiOpsJobFilter = { errorCode: null, clubId: null };

export function aiOpsFilterFromSearchParams(params: URLSearchParams): AiOpsJobFilter {
  return {
    errorCode: params.get("errorCode") || null,
    clubId: params.get("clubId") || null,
  };
}

export function aiOpsSearchFromFilter(filter: AiOpsJobFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.errorCode) {
    params.set("errorCode", filter.errorCode);
  }
  if (filter.clubId) {
    params.set("clubId", filter.clubId);
  }
  return params;
}

export function hasActiveAiOpsFilter(filter: AiOpsJobFilter): boolean {
  return Boolean(filter.errorCode || filter.clubId);
}

export function aiOpsFilterToQuery(filter: AiOpsJobFilter): PlatformAdminAiOpsFilters {
  const query: PlatformAdminAiOpsFilters = {};
  if (filter.errorCode) {
    query.errorCode = filter.errorCode;
  }
  if (filter.clubId) {
    query.clubId = filter.clubId;
  }
  return query;
}
