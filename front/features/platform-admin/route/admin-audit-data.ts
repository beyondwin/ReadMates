import type { QueryClient } from "@tanstack/react-query";
import { replace, type LoaderFunctionArgs } from "react-router";
import { adminAuditFiltersFromSearchParams, adminAuditSearchFromFilters } from "@/features/platform-admin/model/platform-admin-audit-model";
import { platformAdminAuditLedgerInfiniteQuery } from "@/features/platform-admin/queries/platform-admin-audit-queries";

const SAFE_AUDIT_PARAMS = new Set(["range", "from", "to", "clubId", "actorRole", "sourceSlice", "actionCategory", "outcome", "event", "mode"]);
const SAFE_EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function adminAuditEventFromSearchParams(params: URLSearchParams): string | null {
  const raw = params.get("event");
  if (!raw || !SAFE_EVENT_ID.test(raw)) return null;
  return raw;
}

export function adminAuditDetailOpenFromSearchParams(params: URLSearchParams): boolean {
  return params.get("mode") === "detail" && adminAuditEventFromSearchParams(params) !== null;
}

export function adminAuditLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminAudit(args: LoaderFunctionArgs) {
    const url = new URL(args.request.url);
    const filters = adminAuditFiltersFromSearchParams(url.searchParams);
    const eventId = adminAuditEventFromSearchParams(url.searchParams);
    const mode = url.searchParams.get("mode");
    const hasUnsafeParams = [...url.searchParams.keys()].some((key) => !SAFE_AUDIT_PARAMS.has(key));
    const normalized = adminAuditSearchFromFilters(filters);
    if (eventId) normalized.set("event", eventId);
    if (mode === "detail" && eventId) normalized.set("mode", "detail");
    const hasDuplicateSafeParam = [...SAFE_AUDIT_PARAMS].some((key) => url.searchParams.getAll(key).length > 1);
    const hasInvalidSafeParam =
      invalidEnum(url.searchParams, "range", filters.range) ||
      invalidInstant(url.searchParams.get("from")) ||
      invalidInstant(url.searchParams.get("to")) ||
      invalidIdentifier(url.searchParams, "clubId", filters.clubId) ||
      invalidEnum(url.searchParams, "actorRole", filters.actorRole) ||
      invalidEnum(url.searchParams, "sourceSlice", filters.sourceSlice) ||
      invalidEnum(url.searchParams, "actionCategory", filters.actionCategory) ||
      invalidEnum(url.searchParams, "outcome", filters.outcome) ||
      invalidEvent(url.searchParams.get("event"), eventId) ||
      invalidMode(mode, eventId);
    if (hasUnsafeParams || hasDuplicateSafeParam || hasInvalidSafeParam) {
      throw replace(`${url.pathname}?${normalized.toString()}`);
    }
    await queryClient.fetchInfiniteQuery(platformAdminAuditLedgerInfiniteQuery(filters));
    return null;
  };
}

function invalidEvent(raw: string | null, normalized: string | null) {
  return raw !== null && raw !== normalized;
}

function invalidMode(raw: string | null, eventId: string | null) {
  if (raw === null) return false;
  return raw !== "detail" || eventId === null;
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
