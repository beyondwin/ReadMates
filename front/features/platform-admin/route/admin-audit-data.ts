import type { QueryClient } from "@tanstack/react-query";
import { replace, type LoaderFunctionArgs } from "react-router";
import { adminAuditFiltersFromSearchParams, adminAuditSearchFromFilters } from "@/features/platform-admin/model/platform-admin-audit-model";
import { platformAdminAuditLedgerInfiniteQuery } from "@/features/platform-admin/queries/platform-admin-audit-queries";

const SAFE_AUDIT_PARAMS = new Set(["range", "from", "to", "clubId", "actorRole", "sourceSlice", "actionCategory", "outcome"]);

export function adminAuditLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminAudit(args: LoaderFunctionArgs) {
    const url = new URL(args.request.url);
    const filters = adminAuditFiltersFromSearchParams(url.searchParams);
    const hasUnsafeParams = [...url.searchParams.keys()].some((key) => !SAFE_AUDIT_PARAMS.has(key));
    const normalized = adminAuditSearchFromFilters(filters);
    const hasDuplicateSafeParam = [...SAFE_AUDIT_PARAMS].some((key) => url.searchParams.getAll(key).length > 1);
    const hasInvalidSafeParam =
      invalidEnum(url.searchParams, "range", filters.range) ||
      invalidInstant(url.searchParams.get("from")) ||
      invalidInstant(url.searchParams.get("to")) ||
      invalidIdentifier(url.searchParams, "clubId", filters.clubId) ||
      invalidEnum(url.searchParams, "actorRole", filters.actorRole) ||
      invalidEnum(url.searchParams, "sourceSlice", filters.sourceSlice) ||
      invalidEnum(url.searchParams, "actionCategory", filters.actionCategory) ||
      invalidEnum(url.searchParams, "outcome", filters.outcome);
    if (hasUnsafeParams || hasDuplicateSafeParam || hasInvalidSafeParam) {
      throw replace(`${url.pathname}?${normalized.toString()}`);
    }
    await queryClient.fetchInfiniteQuery(platformAdminAuditLedgerInfiniteQuery(filters));
    return null;
  };
}

function invalidEnum(params: URLSearchParams, key: string, normalized: string | null | undefined) {
  const raw = params.get(key);
  return raw !== null && raw !== normalized;
}

function invalidInstant(raw: string | null) {
  return raw !== null && !Number.isFinite(Date.parse(raw));
}

function invalidIdentifier(params: URLSearchParams, key: string, normalized: string | null | undefined) {
  const raw = params.get(key);
  return raw !== null && raw.trim() !== normalized;
}
