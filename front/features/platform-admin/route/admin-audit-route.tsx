import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  adminAuditFiltersFromSearchParams,
  adminAuditSearchFromFilters,
  type AdminAuditFilters,
} from "@/features/platform-admin/model/platform-admin-audit-model";
import { platformAdminAuditLedgerQuery } from "@/features/platform-admin/queries/platform-admin-audit-queries";
import { AdminAuditLedger } from "@/features/platform-admin/ui/admin-audit-ledger";

const GENERIC_ERROR = "감사 ledger를 처리하지 못했습니다. 다시 시도해 주세요.";

export function AdminAuditRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => adminAuditFiltersFromSearchParams(searchParams), [searchParams]);
  const [cursor, setCursor] = useState<string | null>(filters.cursor ?? null);
  const query = useQuery(platformAdminAuditLedgerQuery({ ...filters, cursor }));

  function changeFilters(next: AdminAuditFilters) {
    setCursor(null);
    setSearchParams(adminAuditSearchFromFilters({ ...next, cursor: null }));
  }

  function loadMore() {
    if (query.data?.nextCursor) {
      setCursor(query.data.nextCursor);
    }
  }

  return (
    <AdminAuditLedger
      page={query.data ?? null}
      filters={filters}
      loading={query.isLoading}
      error={query.isError ? GENERIC_ERROR : null}
      onFilterChange={changeFilters}
      onLoadMore={loadMore}
    />
  );
}
