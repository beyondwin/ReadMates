import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { ADMIN_COPY, auditOutcomeLabel } from "@/features/platform-admin/model/admin-copy";
import {
  buildAdminAuditOperationSummary,
  adminAuditActorPrimaryLabel,
  adminAuditActionPrimaryLabel,
  adminAuditReasonLabel,
  adminAuditTargetPrimaryLabel,
  buildAdminAuditLedgerRow,
  formatAdminAuditOccurredAt,
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
import { AdminPageContext } from "./admin-page-context";
import type { AdminPageState } from "./admin-state-panel";
import { AdminWorkViewBar } from "./admin-work-view-bar";
import { AdminTechnicalDisclosure } from "@/features/platform-admin/ui/admin-technical-disclosure";
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
  const rowsRef = useRef<HTMLDivElement>(null);
  const wasDetailOpen = useRef(detailOpen);
  const [findDraft, setFindDraft] = useState("");
  const selected = page?.items.find((item) => item.id === selectedId)
    ?? (selectedId ? null : page?.items[0] ?? null);

  useEffect(() => {
    if (wasDetailOpen.current && !detailOpen && selectedId) {
      const row = [...(rowsRef.current?.querySelectorAll<HTMLButtonElement>("[data-audit-row]") ?? [])]
        .find((button) => button.dataset.auditRow === selectedId);
      row?.focus();
    }
    wasDetailOpen.current = detailOpen;
  }, [detailOpen, selectedId]);
  const hasFilters = sensitiveSearch.active || Object.entries(filters).some(([key, value]) => {
    if (key === "range") return value !== "7d";
    return Boolean(value);
  });
  const ledgerState = auditLedgerState({ page, loading, error });
  const freshness = page?.filters.from && page?.filters.to
    ? formatDateRange(page.filters.from, page.filters.to)
    : `범위 ${filters.range ?? "7d"}`;

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
    onSelect(nextItem ?? item);
  }

  return (
    <div className="admin-audit">
      <AdminPageContext
        heading="처리 기록"
        description="누가 무엇을 왜 처리했는지 확인합니다."
      >
        {sensitiveSearch.error ? <p className="admin-audit__error" role="alert">{sensitiveSearch.error}</p> : null}
        {error && page ? <p className="admin-audit__error" role="alert">{error}</p> : null}

        <div className="admin-audit__body" data-detail-open={detailOpen ? "true" : "false"}>
          <div className="admin-audit__list">
            <p className="admin-audit__title" aria-hidden="true">처리 기록</p>
            <label className="admin-audit__find">
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
            {sensitiveSearch.canSearch ? (
              <form className="admin-audit__search" onSubmit={(event) => { event.preventDefault(); sensitiveSearch.onSubmit(); }}>
                <label htmlFor="admin-audit-sensitive-search">민감 대상 검색</label>
                <input id="admin-audit-sensitive-search" type="search" value={sensitiveSearch.value} autoComplete="off" onChange={(event) => sensitiveSearch.onChange(event.currentTarget.value)} />
                <button type="submit" className="btn btn-secondary btn-sm" disabled={sensitiveSearch.pending || !sensitiveSearch.value.trim()}>대상 검색</button>
                {sensitiveSearch.active ? <button type="button" className="btn btn-quiet btn-sm" onClick={sensitiveSearch.onClear}>민감 검색 지우기</button> : null}
              </form>
            ) : null}
            <details className="admin-audit__disclosure">
              <summary>{filters.range === "24h" ? "오늘" : freshness}</summary>
              <AdminWorkViewBar
                filters={
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
                          {range === "24h" ? "오늘" : range}
                        </button>
                      ))}
                    </div>
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
            <div ref={rowsRef} className="admin-audit__rows" aria-label="처리 기록 목록" tabIndex={-1}>
              {page && page.items.length > 0 ? page.items.filter((item) => {
                if (sensitiveSearch.canSearch || !findDraft.trim()) return true;
                const row = buildAdminAuditLedgerRow(item);
                const haystack = `${auditRowTitle(item)} ${row.action} ${item.summary}`;
                return haystack.includes(findDraft.trim());
              }).map((item) => (
                <AuditRow
                  key={item.id}
                  item={item}
                  selected={selected?.id === item.id}
                  onSelect={() => onSelect(item)}
                  onKeyDown={(event) => handleRowKeyDown(event, item)}
                />
              )) : null}
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
          </AdminEvidenceLedger>
          </div>
          <AuditDetail item={selected} onBack={onCloseDetail} />
        </div>
      </AdminPageContext>
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
  const title = auditRowTitle(item);
  return (
    <button
      type="button"
      data-audit-row={item.id}
      aria-pressed={selected}
      className="admin-audit__row admin-processing-records__row"
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span className="admin-audit__row-title">{title}</span>
      <span className="admin-audit__row-main">
        <time
          className="admin-audit__row-time"
          dateTime={item.occurredAt}
          data-audit-row-field="time"
        >
          {row.occurredAt}
        </time>
        <span className="admin-audit__row-time-short">{formatShortTime(item.occurredAt)}</span>
        <span> · </span>
        <span data-audit-row-field="actor">{row.actor}</span>
        <span className="admin-audit__row-extra">
          <span> · </span>
          <span data-audit-row-field="action">{row.action}</span>
          <span> · </span>
          <span data-audit-row-field="outcome">{row.result}</span>
        </span>
      </span>
      <span className="admin-audit__row-status">{row.result === "완료" ? "정상" : row.result}</span>
    </button>
  );
}

function auditRowTitle(item: AdminAuditLedgerItem): string {
  if (item.actionType === "ADMIN_NOTIFICATION_REPLAY_CONFIRMED") return "알림 다시 보내기 완료";
  if (item.actionType === "FEEDBACK_DOCUMENT_PUBLISHED") return "공개 기록 확인 완료";
  if (item.actionType === "ADMIN_CLUB_METADATA_UPDATED") return "클럽 운영 상태 변경";
  return adminAuditActionPrimaryLabel(item) ?? item.summary;
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
  const title = auditRowTitle(item);
  const docketFields = ["처리한 이유", "영향 범위", "변경 전", "변경 후", "처리 결과"]
    .map((label) => safeMetadata.find((entry) => entry.label === label))
    .filter((entry): entry is NonNullable<typeof safeMetadata[number]> => Boolean(entry));
  return (
    <aside className="admin-audit__detail" aria-label="감사 이벤트 상세" role="region">
      <button type="button" className="btn btn-quiet btn-sm admin-audit__back" onClick={onBack}>목록으로</button>
      <p className="admin-audit__docket-kicker">선택한 기록</p>
      <h2 className="h3 editorial">{title}</h2>
      <p className="admin-audit__docket-summary">{item.summary}</p>
      {docketFields.length > 0 ? (
        <dl className="admin-audit__docket-fields">
          {docketFields.map((entry) => (
            <div key={entry.label}>
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
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

function formatDateRange(from: unknown, to: unknown) {
  return `${formatAdminAuditOccurredAt(String(from))}–${formatAdminAuditOccurredAt(String(to))}`;
}

function formatShortTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
