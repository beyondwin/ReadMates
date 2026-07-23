import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useParams, useSearchParams } from "react-router-dom";
import type { HostSessionRecordLedgerPage } from "@/features/host/api/host-contracts";
import {
  normalizeHostSessionLedgerFilters,
  toHostSessionLedgerSearch,
  type HostSessionLedgerFilters,
} from "@/features/host/model/host-session-ledger-model";
import { hostSessionRecordLedgerQuery } from "@/features/host/queries/host-session-record-queries";
import {
  HostSessionLedger,
  type HostSessionLedgerLinkComponent,
} from "@/features/host/ui/host-session-ledger";
import {
  HOST_SESSION_LEDGER_PAGE_LIMIT,
  type HostSessionLedgerRouteData,
} from "./host-session-ledger-data";

function sameFilters(left: HostSessionLedgerFilters, right: HostSessionLedgerFilters) {
  return left.search === right.search
    && left.state === right.state
    && left.recordStatus === right.recordStatus
    && left.needsAttention === right.needsAttention;
}

export function HostSessionLedgerRoute({
  LinkComponent,
}: {
  LinkComponent?: HostSessionLedgerLinkComponent;
}) {
  const loaderData = useLoaderData() as HostSessionLedgerRouteData;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => ({ clubSlug }), [clubSlug]);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(
    () => normalizeHostSessionLedgerFilters(searchParams),
    [searchParams],
  );
  const firstRequest = useMemo(
    () => ({ ...filters, page: { limit: HOST_SESSION_LEDGER_PAGE_LIMIT } }),
    [filters],
  );
  const query = useQuery(hostSessionRecordLedgerQuery(firstRequest, context));
  const loaderPage = sameFilters(filters, loaderData.filters) ? loaderData.page : null;
  const basePage = query.data ?? loaderPage;
  const [appended, setAppended] = useState<{
    base: HostSessionRecordLedgerPage;
    items: HostSessionRecordLedgerPage["items"];
    nextCursor: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const visiblePage = basePage && appended?.base === basePage
    ? {
        items: [...basePage.items, ...appended.items],
        nextCursor: appended.nextCursor,
      }
    : basePage;

  const updateFilters = (next: HostSessionLedgerFilters) => {
    setAppended(null);
    setLoadMoreError(null);
    const canonical = toHostSessionLedgerSearch(next);
    setSearchParams(canonical.startsWith("?") ? canonical.slice(1) : "", { replace: true });
  };

  const loadMore = async () => {
    const cursor = visiblePage?.nextCursor;
    if (!basePage || !cursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const nextPage = await queryClient.fetchQuery(hostSessionRecordLedgerQuery({
        ...filters,
        page: { limit: HOST_SESSION_LEDGER_PAGE_LIMIT, cursor },
      }, context));
      setAppended((current) => ({
        base: basePage,
        items: [...(current?.base === basePage ? current.items : []), ...nextPage.items],
        nextCursor: nextPage.nextCursor,
      }));
    } catch {
      setLoadMoreError("더 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main style={{ minWidth: 0 }}>
      <section className="page-header-compact">
        <div className="container">
          <div className="eyebrow">운영 · 세션 기록</div>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>세션 기록 장부</h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            과거와 예정 세션의 기록 상태, 초안, 공개 범위를 한곳에서 확인합니다.
          </p>
        </div>
      </section>
      <section className="container" style={{ paddingTop: 8, paddingBottom: 72, minWidth: 0 }}>
        <HostSessionLedger
          items={visiblePage?.items ?? []}
          filters={filters}
          nextCursor={visiblePage?.nextCursor ?? null}
          loading={query.isPending && !basePage}
          loadingMore={loadingMore}
          errorMessage={query.isError && !basePage ? "세션 기록을 불러오지 못했습니다. 검색 조건은 유지됩니다." : null}
          loadMoreError={loadMoreError}
          onFiltersChange={updateFilters}
          onLoadMore={() => void loadMore()}
          onRetry={() => void query.refetch()}
          LinkComponent={LinkComponent}
        />
      </section>
    </main>
  );
}
