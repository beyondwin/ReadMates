import { useState } from "react";
import { Link } from "react-router-dom";
import {
  buildAdminAuditOperationSummary,
  labelAdminAuditOutcome,
  labelAdminAuditSourceSlice,
  shouldShowAdminAuditDetailValue,
  type AdminAuditFilters,
  type AdminAuditLedgerItem,
  type AdminAuditLedgerPage,
} from "@/features/platform-admin/model/platform-admin-audit-model";

export type AdminAuditLedgerProps = {
  page: AdminAuditLedgerPage | null;
  filters: AdminAuditFilters;
  loading: boolean;
  error: string | null;
  onFilterChange: (filters: AdminAuditFilters) => void;
  onLoadMore: () => void;
};

export function AdminAuditLedger({
  page,
  filters,
  loading,
  error,
  onFilterChange,
  onLoadMore,
}: AdminAuditLedgerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(page?.items[0]?.id ?? null);
  const selected = page?.items.find((item) => item.id === selectedId) ?? page?.items[0] ?? null;

  return (
    <section className="admin-audit" aria-labelledby="admin-audit-title">
      <header className="admin-audit__header">
        <div>
          <p className="eyebrow">S7 Review</p>
          <h1 id="admin-audit-title" className="h1 editorial">
            감사
          </h1>
        </div>
        <p className="admin-audit__timestamp">
          범위 {filters.range ?? "7d"} · {page?.summary.visibleCount ?? 0}건
        </p>
      </header>

      <div className="admin-audit__filters" aria-label="감사 필터">
        {(["24h", "7d", "30d", "90d"] as const).map((range) => (
          <button
            key={range}
            type="button"
            className={filters.range === range ? "btn btn-primary btn-sm" : "btn btn-quiet btn-sm"}
            onClick={() => onFilterChange({ ...filters, range, cursor: null })}
          >
            {range}
          </button>
        ))}
      </div>

      {error ? (
        <p className="admin-audit__error" role="alert">
          {error}
        </p>
      ) : null}
      {page && page.summary.sourceUnavailableCount > 0 ? (
        <p className="admin-audit__partial" role="status">
          일부 감사 source를 불러오지 못했습니다. {page.summary.unavailableSources.join(", ")}
        </p>
      ) : null}
      {loading ? <p className="admin-audit__loading">감사 ledger를 불러오는 중입니다.</p> : null}

      <div className="admin-audit__body">
        <div className="admin-audit__rows" aria-label="감사 이벤트 목록">
          {page && page.items.length > 0 ? (
            page.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="admin-audit__row"
                onClick={() => setSelectedId(item.id)}
              >
                <span className="admin-audit__row-time">{formatTimestamp(item.occurredAt)}</span>
                <span className="admin-audit__row-main">{item.summary}</span>
                <span className="platform-admin-domain-status">{labelAdminAuditOutcome(item.outcome)}</span>
                <span className="admin-audit__slice">{labelAdminAuditSourceSlice(item.sourceSlice)}</span>
              </button>
            ))
          ) : (
            <p className="muted">선택한 조건에 해당하는 감사 이벤트가 없습니다.</p>
          )}
          {page?.nextCursor ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={onLoadMore}>
              더 보기
            </button>
          ) : null}
        </div>
        <AuditDetail item={selected} />
      </div>
    </section>
  );
}

function AuditDetail({ item }: { item: AdminAuditLedgerItem | null }) {
  if (!item) {
    return (
      <aside className="admin-audit__detail" aria-label="감사 이벤트 상세" role="region">
        <p className="muted">이벤트를 선택하세요.</p>
      </aside>
    );
  }
  const safeMetadata = item.safeMetadata.filter((entry) => shouldShowAdminAuditDetailValue(entry.label, entry.value));
  const operationSummary = buildAdminAuditOperationSummary(item);
  return (
    <aside className="admin-audit__detail" aria-label="감사 이벤트 상세" role="region">
      <h2 className="h3 editorial">{item.summary}</h2>
      <p className="tiny muted">
        {item.sourceTable} · {item.actionType}
      </p>
      <div className={`admin-audit__operation admin-audit__operation--${operationSummary.state.toLowerCase()}`}>
        <p className="eyebrow">운영 판단</p>
        <strong>{operationSummary.label}</strong>
        <p className="small muted">{operationSummary.detail}</p>
        {operationSummary.nextHref ? (
          <Link to={operationSummary.nextHref} className="admin-audit__drill">
            {operationSummary.nextLabel}
          </Link>
        ) : null}
      </div>
      {safeMetadata.length > 0 ? (
        <dl className="admin-audit__metadata">
          {safeMetadata.map((entry) => (
            <div key={`${entry.label}-${entry.value}`}>
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {item.metadataState === "UNAVAILABLE" ? <p className="muted">세부 정보를 안전하게 표시할 수 없습니다.</p> : null}
      {item.metadataState === "EMPTY" ? <p className="muted">세부 정보 숨김</p> : null}
    </aside>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
