import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { ADMIN_COPY, auditOutcomeLabel } from "@/features/platform-admin/model/admin-copy";
import {
  ADMIN_AUDIT_PERIODS,
  adminAuditActorPrimaryLabel,
  adminAuditActionPrimaryLabel,
  adminAuditFiltersFromPeriod,
  adminAuditPeriodFromFilters,
  adminAuditReasonLabel,
  adminAuditRowStatusLabel,
  adminAuditRowTitle,
  adminAuditTargetPrimaryLabel,
  adminAuditVisibleSummary,
  buildAdminAuditDetailSections,
  buildAdminAuditLedgerRow,
  buildAdminAuditOperationSummary,
  formatAdminAuditLedgerSentenceBody,
  formatAdminAuditRowClock,
  isAdminAuditTechnicalMetadata,
  labelAdminAuditActionCategory,
  labelAdminAuditActorRole,
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
import { AdminEvidenceLedger } from "./admin-evidence-ledger";
import type { AdminPageState } from "./admin-state-panel";
import { AdminWorkViewBar } from "./admin-work-view-bar";
import { AdminTechnicalDisclosure } from "@/features/platform-admin/ui/admin-technical-disclosure";
import { ReadmatesIcon } from "@/shared/ui/icon";
import "./admin-processing-records.css";

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
  selectedId: string | null;
  detailOpen: boolean;
  onSelect: (item: AdminAuditLedgerItem) => void;
  onCloseDetail: () => void;
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
  selectedId,
  detailOpen,
  onSelect,
  onCloseDetail,
  onFilterChange,
  onLoadMore,
  onRetryLoadMore,
}: AdminAuditLedgerProps) {
  const rowsRef = useRef<HTMLUListElement>(null);
  const periodWrapRef = useRef<HTMLDivElement>(null);
  const wasDetailOpen = useRef(detailOpen);
  const previousSelectedId = useRef(selectedId);
  const [findDraft, setFindDraft] = useState("");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const selected = page?.items.find((item) => item.id === selectedId)
    ?? (selectedId ? null : page?.items[0] ?? null);
  const period = adminAuditPeriodFromFilters(filters);
  const listHeadingIsPage = !selected || !detailOpen;
  const ListHeading = listHeadingIsPage ? "h1" : "h2";

  useEffect(() => {
    if (wasDetailOpen.current && !detailOpen && selectedId) {
      const row = [...(rowsRef.current?.querySelectorAll<HTMLElement>("[data-audit-row]") ?? [])]
        .find((element) => element.dataset.auditRow === selectedId);
      row?.focus();
    }
    wasDetailOpen.current = detailOpen;
  }, [detailOpen, selectedId]);

  useEffect(() => {
    const previousId = previousSelectedId.current;
    previousSelectedId.current = selectedId;
    if (!previousId || selectedId) return;
    const row = [...(rowsRef.current?.querySelectorAll<HTMLElement>("[data-audit-row]") ?? [])]
      .find((element) => element.dataset.auditRow === previousId)
      ?? rowsRef.current?.querySelector<HTMLElement>("[data-audit-row]");
    row?.focus();
  }, [selectedId]);

  useEffect(() => {
    if (!periodOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (periodWrapRef.current?.contains(event.target as Node)) return;
      setPeriodOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [periodOpen]);
  const hasFilters = sensitiveSearch.active || Object.entries(filters).some(([key, value]) => {
    if (key === "range") return value !== "7d";
    return Boolean(value);
  });
  const ledgerState = auditLedgerState({ page, loading, error });

  function handleRowKeyDown(event: KeyboardEvent<HTMLButtonElement>, item: AdminAuditLedgerItem) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(item);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const rows = [...(rowsRef.current?.querySelectorAll<HTMLElement>("[data-audit-row]") ?? [])];
    const current = rows.indexOf(event.currentTarget);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)));
    const next = rows[nextIndex];
    const nextItem = page?.items.find((candidate) => candidate.id === next?.dataset.auditRow);
    next?.focus();
    onSelect(nextItem ?? item);
  }

  const visibleItems = page && page.items.length > 0 ? page.items.filter((item) => {
    if (sensitiveSearch.canSearch || !findDraft.trim()) return true;
    const row = buildAdminAuditLedgerRow(item);
    const haystack = `${adminAuditRowTitle(item)} ${row.action} ${item.summary}`;
    return haystack.includes(findDraft.trim());
  }) : [];

  return (
    <div className="admin-audit">
      {sensitiveSearch.error ? <p className="admin-audit__error" role="alert">{sensitiveSearch.error}</p> : null}
      {error && page ? <p className="admin-audit__error" role="alert">{error}</p> : null}

      <div className="admin-audit__body" data-detail-open={detailOpen ? "true" : "false"}>
        <div className="admin-audit__list">
          <ListHeading>처리 기록</ListHeading>
          <label className="admin-audit__search">
            <ReadmatesIcon name="search" size={16} />
            <span className="label">기록 찾기</span>
            <input
              type="search"
              placeholder="기록 찾기"
              aria-label="기록 찾기"
              value={sensitiveSearch.canSearch ? sensitiveSearch.value : findDraft}
              autoComplete="off"
              onChange={(event) => {
                if (sensitiveSearch.canSearch) sensitiveSearch.onChange(event.currentTarget.value);
                else setFindDraft(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && sensitiveSearch.canSearch) {
                  event.preventDefault();
                  sensitiveSearch.onSubmit();
                }
              }}
            />
          </label>
          <div className="admin-audit__period-wrap" ref={periodWrapRef}>
            <button
              type="button"
              className="admin-audit__period"
              aria-expanded={periodOpen}
              aria-haspopup="listbox"
              aria-controls="admin-audit-period-options"
              onClick={() => setPeriodOpen((open) => !open)}
            >
              {period.label}
              <ReadmatesIcon name="chevron-down" size={16} />
            </button>
            {periodOpen ? (
              <ul id="admin-audit-period-options" className="admin-audit__period-menu" role="listbox" aria-label="기간">
                {ADMIN_AUDIT_PERIODS.map((item) => (
                  <li key={item.id} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={item.id === period.id}
                      onClick={() => {
                        onFilterChange(adminAuditFiltersFromPeriod(item.id, filters));
                        setPeriodOpen(false);
                        if (item.id === "custom") setFiltersOpen(true);
                      }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {sensitiveSearch.canSearch ? (
            <form className="admin-audit__sensitive" onSubmit={(event) => { event.preventDefault(); sensitiveSearch.onSubmit(); }}>
              <label htmlFor="admin-audit-sensitive-search">민감 대상 검색</label>
              <input id="admin-audit-sensitive-search" type="search" value={sensitiveSearch.value} autoComplete="off" onChange={(event) => sensitiveSearch.onChange(event.currentTarget.value)} />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={sensitiveSearch.pending || !sensitiveSearch.value.trim()}>대상 검색</button>
              {sensitiveSearch.active ? <button type="button" className="btn btn-quiet btn-sm" onClick={sensitiveSearch.onClear}>민감 검색 지우기</button> : null}
            </form>
          ) : null}
          <details
            className="admin-audit__disclosure"
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          >
            <summary>필터</summary>
            <AdminWorkViewBar
              filters={
                <fieldset className="admin-audit__filters">
                  <legend>감사 필터</legend>
                  <label>시작 시각<input type="datetime-local" value={toLocalDateTime(filters.from)} onChange={(event) => onFilterChange({ ...filters, from: toUtcInstant(event.currentTarget.value), range: undefined })} /></label>
                  <label>종료 시각<input type="datetime-local" value={toLocalDateTime(filters.to)} onChange={(event) => onFilterChange({ ...filters, to: toUtcInstant(event.currentTarget.value), range: undefined })} /></label>
                  <label>클럽 ID<input value={filters.clubId ?? ""} onChange={(event) => onFilterChange({ ...filters, clubId: event.currentTarget.value || null })} /></label>
                  <FilterSelect label="행위자 역할" value={filters.actorRole} values={ACTOR_ROLES} labels={ACTOR_ROLES.map(labelAdminAuditActorRole)} onChange={(value) => onFilterChange({ ...filters, actorRole: value as AdminAuditActorRole | null })} />
                  <FilterSelect label="소스 영역" value={filters.sourceSlice} values={SOURCE_SLICES} labels={SOURCE_SLICES.map(labelAdminAuditSourceSlice)} onChange={(value) => onFilterChange({ ...filters, sourceSlice: value as AdminAuditSourceSlice | null })} />
                  <FilterSelect label="행동 분류" value={filters.actionCategory} values={ACTION_CATEGORIES} labels={ACTION_CATEGORIES.map(labelAdminAuditActionCategory)} onChange={(value) => onFilterChange({ ...filters, actionCategory: value as AdminAuditActionCategory | null })} />
                  <FilterSelect label="결과" value={filters.outcome} values={OUTCOMES} labels={OUTCOMES.map(auditOutcomeLabel)} onChange={(value) => onFilterChange({ ...filters, outcome: value as AdminAuditOutcome | null })} />
                  <button type="button" className="btn btn-quiet btn-sm admin-audit__reset" onClick={() => onFilterChange({ range: "7d" })}>필터 초기화</button>
                </fieldset>
              }
            />
          </details>
          <AdminEvidenceLedger
            label={ADMIN_COPY.heading.auditLedger}
            count={page && ledgerState !== "loading" && ledgerState !== "unavailable" ? page.summary.visibleCount : undefined}
            state={ledgerState}
            title={
              ledgerState === "loading"
                ? "처리 기록을 불러오는 중입니다."
                : ledgerState === "unavailable"
                  ? error
                  : ledgerState === "empty"
                    ? (hasFilters ? "선택한 조건에 해당하는 감사 이벤트가 없습니다." : "기록된 감사 이벤트가 없습니다.")
                    : ledgerState === "partial"
                      ? "일부 감사 source를 불러오지 못했습니다."
                      : undefined
            }
            description={
              ledgerState === "partial" && page
                ? `이번 조회에서는 제외됨: ${page.summary.unavailableSources.join(", ")}`
                : ledgerState === "loading" || ledgerState === "empty" || ledgerState === "unavailable"
                  ? ""
                  : undefined
            }
            sources={
              ledgerState === "partial" && page
                ? page.summary.unavailableSources.map((source) => ({
                    id: source,
                    label: source,
                    available: false,
                  }))
                : undefined
            }
          >
            <ul ref={rowsRef} className="admin-audit__rows" role="list" aria-label="처리 기록 목록">
              {visibleItems.map((item) => (
                <AuditRow
                  key={item.id}
                  item={item}
                  selected={selected?.id === item.id}
                  onSelect={() => onSelect(item)}
                  onKeyDown={(event) => handleRowKeyDown(event, item)}
                />
              ))}
            </ul>
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
          </AdminEvidenceLedger>
        </div>
        <AuditDetail item={selected} onBack={onCloseDetail} />
      </div>
    </div>
  );
}

function AuditRow({
  item,
  selected,
  onSelect,
  onKeyDown,
}: {
  item: AdminAuditLedgerItem;
  selected: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const row = buildAdminAuditLedgerRow(item);
  const title = adminAuditRowTitle(item);
  return (
    <li
      data-selected={selected ? "true" : "false"}
      className="admin-audit__row admin-processing-records__row"
      aria-label={`${title} ${formatAdminAuditLedgerSentenceBody(item)}`}
      onClick={onSelect}
    >
      <button
        type="button"
        data-audit-row={item.id}
        className="admin-audit__row-control"
        aria-pressed={selected}
        aria-label={`${title} ${formatAdminAuditLedgerSentenceBody(item)}`}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onKeyDown={onKeyDown}
      >
        <ReadmatesIcon name="check-circle" size={16} />
        <span className="admin-audit__row-title">{title}</span>
        <span className="admin-audit__row-main">
          <time
            className="admin-audit__row-time"
            dateTime={item.occurredAt}
            data-audit-row-field="time"
          >
            {row.occurredAt}
          </time>
          <span className="admin-audit__row-time-short">{formatAdminAuditRowClock(item.occurredAt)}</span>
          <span> · </span>
          <span data-audit-row-field="actor">{row.actor}</span>
          <span className="admin-audit__row-extra">
            <span> · </span>
            <span data-audit-row-field="action">{row.action}</span>
            <span> · </span>
            <span data-audit-row-field="outcome">{row.result}</span>
          </span>
        </span>
        <span className="admin-audit__row-status">{adminAuditRowStatusLabel(item)}</span>
      </button>
    </li>
  );
}

function auditLedgerState({
  page,
  loading,
  error,
}: {
  page: AdminAuditLedgerPage | null;
  loading: boolean;
  error: string | null;
}): AdminPageState {
  if (loading && !page) return "loading";
  if (error && !page) return "unavailable";
  if (!page || page.items.length === 0) return "empty";
  if (page.summary.sourceUnavailableCount > 0) return "partial";
  return "ready";
}

function FilterSelect({
  label,
  value,
  values,
  labels,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  values: string[];
  labels?: string[];
  onChange: (value: string | null) => void;
}) {
  return (
    <label>
      {label}
      <select value={value ?? ""} onChange={(event) => onChange(event.currentTarget.value || null)}>
        <option value="">전체</option>
        {values.map((item, index) => (
          <option key={item} value={item}>{labels?.[index] ?? item}</option>
        ))}
      </select>
    </label>
  );
}

function AuditDetail({ item, onBack }: { item: AdminAuditLedgerItem | null; onBack: () => void }) {
  if (!item) {
    return <aside className="admin-audit__detail" aria-label="감사 이벤트 상세" role="region"><p className="muted">이벤트를 선택하세요.</p></aside>;
  }
  const visibleMetadata = item.safeMetadata.filter((entry) => shouldShowAdminAuditDetailValue(entry.label, entry.value));
  const technicalMetadata = visibleMetadata.filter(isAdminAuditTechnicalMetadata);
  const safeMetadata = visibleMetadata.filter((entry) => !isAdminAuditTechnicalMetadata(entry));
  const operationSummary = buildAdminAuditOperationSummary(item);
  const row = buildAdminAuditLedgerRow(item);
  const action = adminAuditActionPrimaryLabel(item) ?? "처리 내용을 확인해야 합니다.";
  const title = adminAuditRowTitle(item);
  const sections = buildAdminAuditDetailSections(item);
  return (
    <aside className="admin-audit__detail" aria-label="감사 이벤트 상세" role="region">
      <button type="button" className="btn btn-quiet btn-sm admin-audit__back" onClick={onBack}>목록으로</button>
      <p className="admin-audit__eyebrow">선택한 기록</p>
      <h1>
        <ReadmatesIcon name="check-circle-filled" size={24} />
        {title}
      </h1>
      <p className="admin-audit__docket-summary">{adminAuditVisibleSummary(item)}</p>
      {sections.map((section) => (
        <section key={section.heading} className="admin-audit__detail-section">
          <h3>{section.heading}</h3>
          <p>{section.body}</p>
        </section>
      ))}
      <dl className="admin-audit__identity">
        <div><dt>시각</dt><dd>{row.occurredAt}</dd></div>
        <div><dt>누가</dt><dd>{adminAuditActorPrimaryLabel(item.actor)}</dd></div>
        <div><dt>대상</dt><dd>{adminAuditTargetPrimaryLabel(item)}</dd></div>
        <div><dt>무엇을 했나</dt><dd>{action}</dd></div>
        <div><dt>결과</dt><dd>{row.result}</dd></div>
        <div><dt>사유</dt><dd>{adminAuditReasonLabel(item)}</dd></div>
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
      <AdminTechnicalDisclosure
        summary="기술 정보 펼치기"
        items={[
          { label: "처리 기록 식별자", value: item.id },
          { label: "원본 저장소", value: item.sourceTable },
          { label: "원본 행동", value: item.actionType },
          { label: "원본 설명", value: item.summary },
          { label: "원본 결과", value: item.outcome },
          { label: "행위자 역할 코드", value: item.actor.role },
          { label: "클럽 식별자", value: item.target.clubId },
          { label: "사용자 식별자", value: item.target.userId },
          { label: "AI 작업 식별자", value: item.target.jobId },
          { label: "이벤트 식별자", value: item.target.eventId },
          ...technicalMetadata.map((entry) => ({ label: entry.label, value: entry.value })),
        ]}
      />
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
