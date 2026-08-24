import { useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import {
  buildAdminAuditOperationSummary,
  labelAdminAuditActorRole,
  labelAdminAuditOutcome,
  labelAdminAuditSourceSlice,
  shouldShowAdminAuditDetailValue,
  type AdminAuditActionCategory,
  type AdminAuditActorRole,
  type AdminAuditFilters,
  type AdminAuditLedgerItem,
  type AdminAuditLedgerPage,
  type AdminAuditOutcome,
  type AdminAuditSourceSlice,
} from "@/features/platform-admin/model/platform-admin-audit-model";

export type AdminAuditLedgerProps = {
  page: AdminAuditLedgerPage | null;
  filters: AdminAuditFilters;
  loading: boolean;
  error: string | null;
  nextPageError: boolean;
  loadingMore: boolean;
  sensitiveSearch: {
    value: string;
    canSearch: boolean;
    pending: boolean;
    error: string | null;
    active: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onClear: () => void;
  };
  onFilterChange: (filters: AdminAuditFilters) => void;
  onLoadMore: () => void;
  onRetryLoadMore: () => void;
};

const ACTOR_ROLES: AdminAuditActorRole[] = ["OWNER", "OPERATOR", "SUPPORT", "HOST", "MEMBER", "SYSTEM", "UNKNOWN"];
const SOURCE_SLICES: AdminAuditSourceSlice[] = ["S3", "S4", "S5", "S6", "PLATFORM", "CLUB"];
const ACTION_CATEGORIES: AdminAuditActionCategory[] = ["NOTIFICATION", "SUPPORT", "CLUB_LIFECYCLE", "AI_OPS", "AUTH_SECURITY", "PLATFORM_ADMIN"];
const OUTCOMES: AdminAuditOutcome[] = ["SUCCESS", "FAILED", "DENIED", "PREPARED", "UNKNOWN"];

export function AdminAuditLedger({
  page,
  filters,
  loading,
  error,
  nextPageError,
  loadingMore,
  sensitiveSearch,
  onFilterChange,
  onLoadMore,
  onRetryLoadMore,
}: AdminAuditLedgerProps) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const selected = page?.items.find((item) => item.id === selectedId) ?? page?.items[0] ?? null;
  const hasFilters = sensitiveSearch.active || Object.entries(filters).some(([key, value]) => {
    if (key === "range") return value !== "7d";
    return Boolean(value);
  });

  function select(item: AdminAuditLedgerItem) {
    setSelectedId(item.id);
    setDetailOpen(true);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLButtonElement>, item: AdminAuditLedgerItem) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...(rowsRef.current?.querySelectorAll<HTMLButtonElement>("[data-audit-row]") ?? [])];
    const current = buttons.indexOf(event.currentTarget);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : Math.min(buttons.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)));
    const next = buttons[nextIndex];
    const nextItem = page?.items.find((candidate) => candidate.id === next?.dataset.auditRow);
    next?.focus();
    if (nextItem) select(nextItem);
    else select(item);
  }

  return (
    <section className="admin-audit" aria-labelledby="admin-audit-title">
      <header className="admin-audit__header">
        <h1 id="admin-audit-title" className="h1 editorial">감사</h1>
        <p className="admin-audit__timestamp">
          {page?.filters.from && page?.filters.to
            ? `${formatDateRange(page.filters.from, page.filters.to)} · `
            : `범위 ${filters.range ?? "7d"} · `}
          {page?.summary.visibleCount ?? 0}건
        </p>
      </header>

      <fieldset className="admin-audit__filters">
        <legend>감사 필터</legend>
        <div className="admin-audit__ranges">
          {(["24h", "7d", "30d", "90d"] as const).map((range) => (
            <button
              key={range}
              type="button"
              className={filters.range === range && !filters.from && !filters.to ? "btn btn-primary btn-sm" : "btn btn-quiet btn-sm"}
              onClick={() => onFilterChange({ ...filters, range, from: null, to: null })}
            >
              {range}
            </button>
          ))}
        </div>
        <label>시작 시각<input type="datetime-local" value={toLocalDateTime(filters.from)} onChange={(event) => onFilterChange({ ...filters, from: toUtcInstant(event.currentTarget.value), range: undefined })} /></label>
        <label>종료 시각<input type="datetime-local" value={toLocalDateTime(filters.to)} onChange={(event) => onFilterChange({ ...filters, to: toUtcInstant(event.currentTarget.value), range: undefined })} /></label>
        <label>클럽 ID<input value={filters.clubId ?? ""} onChange={(event) => onFilterChange({ ...filters, clubId: event.currentTarget.value || null })} /></label>
        <FilterSelect label="행위자 역할" value={filters.actorRole} values={ACTOR_ROLES} onChange={(value) => onFilterChange({ ...filters, actorRole: value as AdminAuditActorRole | null })} />
        <FilterSelect label="소스 영역" value={filters.sourceSlice} values={SOURCE_SLICES} onChange={(value) => onFilterChange({ ...filters, sourceSlice: value as AdminAuditSourceSlice | null })} />
        <FilterSelect label="행동 분류" value={filters.actionCategory} values={ACTION_CATEGORIES} onChange={(value) => onFilterChange({ ...filters, actionCategory: value as AdminAuditActionCategory | null })} />
        <FilterSelect label="결과" value={filters.outcome} values={OUTCOMES} onChange={(value) => onFilterChange({ ...filters, outcome: value as AdminAuditOutcome | null })} />
        <button type="button" className="btn btn-quiet btn-sm admin-audit__reset" onClick={() => onFilterChange({ range: "7d" })}>필터 초기화</button>
      </fieldset>

      {sensitiveSearch.canSearch ? (
        <form className="admin-audit__search" onSubmit={(event) => { event.preventDefault(); sensitiveSearch.onSubmit(); }}>
          <label htmlFor="admin-audit-sensitive-search">민감 대상 검색</label>
          <input id="admin-audit-sensitive-search" type="search" value={sensitiveSearch.value} autoComplete="off" onChange={(event) => sensitiveSearch.onChange(event.currentTarget.value)} />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={sensitiveSearch.pending || !sensitiveSearch.value.trim()}>대상 검색</button>
          {sensitiveSearch.active ? <button type="button" className="btn btn-quiet btn-sm" onClick={sensitiveSearch.onClear}>민감 검색 지우기</button> : null}
        </form>
      ) : null}

      {sensitiveSearch.error ? <p className="admin-audit__error" role="alert">{sensitiveSearch.error}</p> : null}
      {error ? <p className="admin-audit__error" role="alert">{error}</p> : null}
      {page && page.summary.sourceUnavailableCount > 0 ? (
        <p className="admin-audit__partial" role="status">
          일부 감사 source를 불러오지 못했습니다. 이번 조회에서는 제외됨: {page.summary.unavailableSources.join(", ")}
        </p>
      ) : null}
      {loading ? <p className="admin-audit__loading">감사 ledger를 불러오는 중입니다.</p> : null}

      <div className="admin-audit__body" data-detail-open={detailOpen ? "true" : "false"}>
        <div ref={rowsRef} className="admin-audit__rows" aria-label="감사 이벤트 목록" tabIndex={-1}>
          {page && page.items.length > 0 ? page.items.map((item) => (
            <button
              key={item.id}
              type="button"
              data-audit-row={item.id}
              aria-pressed={selected?.id === item.id}
              className="admin-audit__row"
              onClick={() => select(item)}
              onKeyDown={(event) => handleRowKeyDown(event, item)}
            >
              <span className="admin-audit__row-time">{formatTimestamp(item.occurredAt)}</span>
              <span className="admin-audit__row-main">{item.summary}</span>
              <span className="platform-admin-domain-status">{labelAdminAuditOutcome(item.outcome)}</span>
              <span className="admin-audit__slice">{labelAdminAuditSourceSlice(item.sourceSlice)}</span>
            </button>
          )) : !loading && !error ? (
            <p className="admin-audit__empty">{hasFilters ? "선택한 조건에 해당하는 감사 이벤트가 없습니다." : "기록된 감사 이벤트가 없습니다."}</p>
          ) : null}
          {nextPageError ? (
            <div className="admin-audit__more-error" role="alert">
              <p>이어지는 페이지를 불러오지 못했습니다. 기존 기록은 유지되었습니다.</p>
              <button type="button" className="btn btn-quiet btn-sm" onClick={onRetryLoadMore}>이어 불러오기 재시도</button>
            </div>
          ) : null}
          {page?.nextCursor && !nextPageError ? (
            <button type="button" className="btn btn-quiet btn-sm admin-audit__more" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? "이어 불러오는 중" : "더 보기"}
            </button>
          ) : null}
        </div>
        <AuditDetail item={selected} onBack={() => { setDetailOpen(false); rowsRef.current?.focus(); }} />
      </div>
    </section>
  );
}

function FilterSelect({ label, value, values, onChange }: { label: string; value: string | null | undefined; values: string[]; onChange: (value: string | null) => void }) {
  return <label>{label}<select value={value ?? ""} onChange={(event) => onChange(event.currentTarget.value || null)}><option value="">전체</option>{values.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>;
}

function AuditDetail({ item, onBack }: { item: AdminAuditLedgerItem | null; onBack: () => void }) {
  if (!item) {
    return <aside className="admin-audit__detail" aria-label="감사 이벤트 상세" role="region"><p className="muted">이벤트를 선택하세요.</p></aside>;
  }
  const safeMetadata = item.safeMetadata.filter((entry) => shouldShowAdminAuditDetailValue(entry.label, entry.value));
  const operationSummary = buildAdminAuditOperationSummary(item);
  return (
    <aside className="admin-audit__detail" aria-label="감사 이벤트 상세" role="region">
      <button type="button" className="btn btn-quiet btn-sm admin-audit__back" onClick={onBack}>목록으로</button>
      <h2 className="h3 editorial">{item.summary}</h2>
      <p className="tiny muted">{item.sourceTable} · {item.actionType}</p>
      <dl className="admin-audit__identity">
        <div><dt>행위자</dt><dd>{item.actor.displayLabel} · {labelAdminAuditActorRole(item.actor.role)}</dd></div>
        <div><dt>대상</dt><dd>{item.target.label}</dd></div>
        {item.target.clubId ? <div><dt>클럽</dt><dd>{item.target.clubId}</dd></div> : null}
        {item.target.jobId ? <div><dt>Job</dt><dd>{item.target.jobId}</dd></div> : null}
        {item.target.eventId ? <div><dt>Event</dt><dd>{item.target.eventId}</dd></div> : null}
      </dl>
      <div className={`admin-audit__operation admin-audit__operation--${operationSummary.state.toLowerCase()}`}>
        <span className="admin-audit__operation-label">운영 판단</span>
        <strong>{operationSummary.label}</strong>
        <p className="small muted">{operationSummary.detail}</p>
        {operationSummary.nextHref ? <Link to={operationSummary.nextHref} className="admin-audit__drill">{operationSummary.nextLabel}</Link> : null}
      </div>
      {safeMetadata.length > 0 ? <dl className="admin-audit__metadata">{safeMetadata.map((entry) => <div key={`${entry.label}-${entry.value}`}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}</dl> : null}
      {item.metadataState === "UNAVAILABLE" ? <p className="muted">세부 정보를 안전하게 표시할 수 없습니다.</p> : null}
      {item.metadataState === "EMPTY" ? <p className="muted">안전하게 표시할 추가 세부 정보가 없습니다.</p> : null}
    </aside>
  );
}

function toLocalDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toUtcInstant(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function formatDateRange(from: unknown, to: unknown) {
  return `${formatTimestamp(String(from))}–${formatTimestamp(String(to))}`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
