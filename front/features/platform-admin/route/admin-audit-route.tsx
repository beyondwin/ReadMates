import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  adminAuditFiltersFromSearchParams,
  adminAuditSearchFromFilters,
  mergeAdminAuditLedgerPages,
  type AdminAuditFilters,
  type AdminAuditLedgerItem,
} from "@/features/platform-admin/model/platform-admin-audit-model";
import {
  adminAuditDetailOpenFromSearchParams,
  adminAuditEventFromSearchParams,
} from "./admin-audit-data";
import { ADMIN_SHELL_LAYOUT_MEDIA_QUERY } from "@/features/platform-admin/model/admin-route-catalog";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  platformAdminAuditKeys,
  platformAdminAuditLedgerInfiniteQuery,
  platformAdminAuditSensitiveInfiniteQuery,
} from "@/features/platform-admin/queries/platform-admin-audit-queries";
import {
  platformAdminCapabilitiesQuery,
  subscribePlatformAdminAuthorityLoss,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminAuditLedger } from "@/features/platform-admin/ui/admin-audit-ledger";

const GENERIC_ERROR = "처리 기록을 불러오지 못했습니다. 다시 시도해 주세요.";

function compactAdminShellLayout(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(ADMIN_SHELL_LAYOUT_MEDIA_QUERY).matches;
}

type SensitiveSearchRequest = { requestSequence: number; sensitiveTarget: string };

export function AdminAuditRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const filters = useMemo(() => adminAuditFiltersFromSearchParams(searchParams), [searchParams]);
  const selectedId = useMemo(() => adminAuditEventFromSearchParams(searchParams), [searchParams]);
  const detailOpen = useMemo(() => adminAuditDetailOpenFromSearchParams(searchParams), [searchParams]);
  const capabilities = useQuery(platformAdminCapabilitiesQuery()).data ?? null;
  const canViewSensitive = capabilities !== null && canAdmin(capabilities, "VIEW_SENSITIVE_AUDIT");
  const previousCanViewSensitive = useRef(canViewSensitive);
  const requestSequence = useRef(0);
  const [searchValue, setSearchValue] = useState("");
  const [sensitiveRequest, setSensitiveRequest] = useState<SensitiveSearchRequest | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const normalQuery = useInfiniteQuery({
    ...platformAdminAuditLedgerInfiniteQuery(filters),
    enabled: sensitiveRequest === null || !canViewSensitive,
  });
  const sensitiveQuery = useInfiniteQuery({
    ...platformAdminAuditSensitiveInfiniteQuery(
      filters,
      sensitiveRequest ?? { requestSequence: 0, sensitiveTarget: "" },
    ),
    enabled: canViewSensitive && sensitiveRequest !== null,
  });
  const activeQuery = sensitiveRequest && canViewSensitive ? sensitiveQuery : normalQuery;
  const page = mergeAdminAuditLedgerPages(activeQuery.data?.pages ?? []);

  const clearSensitiveState = useCallback(() => {
    setSearchValue("");
    setSensitiveRequest(null);
    setSearchError(null);
    queryClient.removeQueries({ queryKey: [...platformAdminAuditKeys.all, "sensitive"] });
  }, [queryClient]);

  useEffect(() => subscribePlatformAdminAuthorityLoss(clearSensitiveState), [clearSensitiveState]);
  useEffect(() => {
    if (previousCanViewSensitive.current && !canViewSensitive) clearSensitiveState();
    previousCanViewSensitive.current = canViewSensitive;
  }, [canViewSensitive, clearSensitiveState]);
  useEffect(
    () => () => queryClient.removeQueries({ queryKey: [...platformAdminAuditKeys.all, "sensitive"] }),
    [queryClient],
  );

  function changeFilters(next: AdminAuditFilters) {
    clearSensitiveState();
    setSearchParams(adminAuditSearchFromFilters(next), { replace: true });
  }

  function selectEvent(item: AdminAuditLedgerItem) {
    const next = adminAuditSearchFromFilters(filters);
    if (next.get("range") === "7d") next.delete("range");
    next.delete("mode");
    next.set("event", item.id);
    // A compact shell shows one pane at a time, so selecting a record must drill in.
    if (compactAdminShellLayout()) next.set("mode", "detail");
    setSearchParams(next);
  }

  function closeDetail() {
    const next = adminAuditSearchFromFilters(filters);
    if (selectedId) next.set("event", selectedId);
    setSearchParams(next, { replace: true });
  }

  function submitSensitiveSearch() {
    const normalized = searchValue.trim();
    if (!canViewSensitive || !normalized) return;
    setSearchError(null);
    requestSequence.current += 1;
    setSensitiveRequest({ requestSequence: requestSequence.current, sensitiveTarget: normalized });
  }

  const queryError = activeQuery.isError && !activeQuery.isFetchNextPageError ? GENERIC_ERROR : null;
  const sensitiveError = sensitiveRequest && sensitiveQuery.isError && !sensitiveQuery.isFetchNextPageError
    ? "민감 대상을 검색하지 못했습니다. 입력은 유지됩니다."
    : searchError;

  return (
    <AdminAuditLedger
      page={page}
      filters={filters}
      loading={activeQuery.isPending}
      error={queryError}
      nextPageError={activeQuery.isFetchNextPageError}
      loadingMore={activeQuery.isFetchingNextPage}
      sensitiveSearch={{
        value: searchValue,
        canSearch: canViewSensitive,
        pending: sensitiveQuery.isPending && sensitiveRequest !== null,
        error: sensitiveError,
        active: sensitiveRequest !== null,
        onChange: (value) => {
          setSearchValue(value);
          setSearchError(null);
        },
        onSubmit: submitSensitiveSearch,
        onClear: clearSensitiveState,
      }}
      selectedId={selectedId}
      detailOpen={detailOpen}
      onSelect={selectEvent}
      onCloseDetail={closeDetail}
      onFilterChange={changeFilters}
      onLoadMore={() => void activeQuery.fetchNextPage()}
      onRetryLoadMore={() => void activeQuery.fetchNextPage()}
    />
  );
}
