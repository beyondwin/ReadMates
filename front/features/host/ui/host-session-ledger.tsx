import { useEffect, useState, type ComponentType, type FormEvent, type ReactNode, type Ref } from "react";
import {
  hostSessionLedgerActionLabel,
  hostSessionLedgerDraftLabel,
  hostSessionLedgerFeedbackLabel,
  hostSessionLedgerLastPublishedItem,
  hostSessionLedgerLastPublishLine,
  hostSessionLedgerPublicationLabel,
  hostSessionLedgerBadges,
  type HostSessionAttentionData,
  type HostSessionLedgerFilters,
  type HostSessionLedgerItem,
  type HostSessionLedgerNextAction,
  type HostSessionLedgerRowFacts,
  type HostSessionLedgerStatusCounts,
  type HostSessionLedgerSummary,
  type HostSessionLedgerWorkItem,
} from "@/features/host/model/host-session-ledger-model";
import { hostMeetingHref } from "@/features/host/model/host-meeting-ledger-model";
import { buildHostWorkboxDisclosure, type HostWorkboxView } from "@/features/host/model/host-workbox-model";
import { formatMeetingOrdinal, hostMeetingLifecycleLabel } from "@/shared/model/meeting-language";
import { readmatesReturnState } from "@/shared/routing/readmates-route-state";
import { ReadmatesIcon, ReadmatesIconBadge } from "@/shared/ui/icon";
import { useOperatingRoomCompactViewport } from "./operating-room/use-operating-room-compact-viewport";
import { HostWorkbox } from "./workbox/host-workbox";
import "./host-editorial-ledger.css";
import "./host-session-ledger.css";

type LedgerLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
  state?: unknown;
  "aria-label"?: string;
};

export type HostSessionLedgerLinkComponent = ComponentType<LedgerLinkProps>;

export type HostSessionLedgerTrashItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  state: HostSessionLedgerItem["state"];
  deletedAtLabel: string;
  remainingCopy: string;
  restoreDisabled?: boolean;
  restoreDisabledReason?: string | null;
  restoreError?: string | null;
  restoreConflict?: { openSessionHref: string; message: string } | null;
  restoring?: boolean;
};

export type HostSessionLedgerProps = {
  items: HostSessionLedgerItem[];
  summary?: HostSessionLedgerSummary;
  filters: HostSessionLedgerFilters;
  nextCursor: string | null;
  loadingMore: boolean;
  onFiltersChange: (filters: HostSessionLedgerFilters) => void;
  onLoadMore: () => void;
  LinkComponent?: HostSessionLedgerLinkComponent;
  loading?: boolean;
  errorMessage?: string | null;
  loadMoreError?: string | null;
  onRetry?: () => void;
  trashItems?: HostSessionLedgerTrashItem[];
  trashHref?: string;
  activeHref?: string;
  recordReturnHref?: string;
  onRestore?: (sessionId: string) => void;
  onRetryRestore?: (sessionId: string) => void;
  headingRef?: Ref<HTMLHeadingElement>;
  factsBySessionId?: Record<string, HostSessionLedgerRowFacts>;
  nextAction?: HostSessionLedgerNextAction | null;
  workItems?: HostSessionLedgerWorkItem[];
  statusCounts?: HostSessionLedgerStatusCounts;
  workTabCounts?: { now: number; deferred: number };
  workbox?: HostWorkboxView | null;
  workboxState?: HostWorkboxView["state"];
  workboxLoading?: boolean;
  workboxError?: string | null;
  onWorkboxStateChange?: (state: HostWorkboxView["state"]) => void;
  onWorkboxRetry?: () => void;
  onWorkboxLoadMore?: (cursor: string) => void;
  exportHref?: string;
};

const HOST_RECORDS_FOCUS_KEY = "readmates.host-records.focus-restore";

type RecordsStatusFilter = "all" | "closing" | "drafting" | "published";
type LedgerTone = "warn" | "ok" | "danger" | "accent";

function DefaultLink({ to, children, state: _state, ...props }: LedgerLinkProps) {
  void _state;
  return <a {...props} href={to}>{children}</a>;
}

function sessionRecordHref(sessionId: string) {
  return hostMeetingHref(sessionId);
}

function stateLabel(state: HostSessionLedgerItem["state"]) {
  return hostMeetingLifecycleLabel(state);
}

function recordsDateLabel(date: string, override?: string) {
  if (override) return override;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return `${Number(match[2])}월 ${Number(match[3])}일`;
}

function rowFacts(
  item: HostSessionLedgerItem,
  factsBySessionId: Record<string, HostSessionLedgerRowFacts> | undefined,
): HostSessionLedgerRowFacts {
  const overlay = factsBySessionId?.[item.sessionId];
  return {
    attendanceLabel: overlay?.attendanceLabel ?? "—",
    reflectionLabel: overlay?.reflectionLabel ?? "—",
    draftLabel: overlay?.draftLabel ?? hostSessionLedgerDraftLabel(item),
    feedbackLabel: overlay?.feedbackLabel ?? hostSessionLedgerFeedbackLabel(item),
    publicationLabel: overlay?.publicationLabel ?? hostSessionLedgerPublicationLabel(item),
    actionLabel: overlay?.actionLabel ?? hostSessionLedgerActionLabel(item),
    dateLabel: overlay?.dateLabel ?? recordsDateLabel(item.date),
  };
}

function rowMatchesFilter(item: HostSessionLedgerItem, facts: HostSessionLedgerRowFacts, filter: RecordsStatusFilter) {
  if (filter === "all") return true;
  if (filter === "closing") {
    return item.needsAttention || item.recordStatus === "NOT_STARTED" || facts.publicationLabel === "마감 필요";
  }
  if (filter === "drafting") return item.hasDraft || facts.draftLabel === "작성 중";
  return item.state === "PUBLISHED" || facts.publicationLabel === "게시됨";
}

function ledgerFactTone(label: string | undefined): LedgerTone | undefined {
  if (label === "작성 중" || label === "확인 필요") return "warn";
  if (label === "완료") return "ok";
  if (label === "초안 없음" || label === "미등록" || label === "마감 필요") return "danger";
  if (label === "게시 준비") return "accent";
  return undefined;
}

function LedgerFilters({
  filters,
  onFiltersChange,
}: Pick<HostSessionLedgerProps, "filters" | "onFiltersChange">) {
  const [search, setSearch] = useState(filters.search);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onFiltersChange({ ...filters, search: search.trim().replace(/\s+/g, " ") });
  };

  return (
    <form role="search" onSubmit={submit} className="rm-document-panel rm-record-ledger__filters">
      <label className="rm-record-ledger__filter-field">
        <span className="tiny">모임 기록 검색</span>
        <span className="rm-record-ledger__search-row">
          <input
            className="input"
            type="search"
            aria-label="모임 기록 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="btn btn-primary btn-sm" type="submit">검색</button>
        </span>
      </label>
      <label className="rm-record-ledger__filter-field">
        <span className="tiny">기록 상태</span>
        <select
          className="input"
          aria-label="기록 상태"
          value={filters.recordStatus ?? ""}
          onChange={(event) => onFiltersChange({
            ...filters,
            recordStatus: (event.target.value || null) as HostSessionLedgerFilters["recordStatus"],
          })}
        >
          <option value="">전체</option>
          <option value="NOT_STARTED">시작 전</option>
          <option value="INCOMPLETE">미완료</option>
          <option value="COMPLETE">완료</option>
        </select>
      </label>
      <label className="rm-record-ledger__filter-field">
        <span className="tiny">확인 필요</span>
        <select
          className="input"
          aria-label="확인 필요"
          value={filters.needsAttention === null ? "" : String(filters.needsAttention)}
          onChange={(event) => onFiltersChange({
            ...filters,
            needsAttention: event.target.value === "" ? null : event.target.value === "true",
          })}
        >
          <option value="">전체</option>
          <option value="true">확인 필요</option>
          <option value="false">확인 완료</option>
        </select>
      </label>
    </form>
  );
}

function DesktopLedger({
  items,
  LinkComponent,
  recordReturnHref,
}: {
  items: Array<{ item: HostSessionLedgerItem; facts: HostSessionLedgerRowFacts }>;
  LinkComponent: HostSessionLedgerLinkComponent;
  recordReturnHref: string;
}) {
  return (
    <div className="desktop-only rm-host-records-ledger">
      <table aria-label="모임 기록 장부">
        <thead>
          <tr>
            {["모임", "출석", "소감", "기록 초안", "피드백 문서", "게시", "작업"].map((label) => (
              <th key={label} scope="col">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(({ item, facts }) => {
            const action = facts.actionLabel ?? hostSessionLedgerActionLabel(item);
            return (
              <tr key={item.sessionId}>
                <td>
                  <strong>No. {item.sessionNumber} · {item.bookTitle}</strong>
                  <div className="tiny">{facts.dateLabel}</div>
                </td>
                <td data-tone={ledgerFactTone(facts.attendanceLabel)}>{facts.attendanceLabel}</td>
                <td data-tone={ledgerFactTone(facts.reflectionLabel)}>{facts.reflectionLabel}</td>
                <td data-tone={ledgerFactTone(facts.draftLabel)}>{facts.draftLabel}</td>
                <td data-tone={ledgerFactTone(facts.feedbackLabel)}>{facts.feedbackLabel}</td>
                <td data-tone={ledgerFactTone(facts.publicationLabel)}>{facts.publicationLabel}</td>
                <td>
                  <LinkComponent
                    to={sessionRecordHref(item.sessionId)}
                    state={readmatesReturnState({ href: recordReturnHref, label: "기록으로" })}
                    className="btn btn-outline btn-sm"
                    aria-label={`${formatMeetingOrdinal(item.sessionNumber, "folio")} ${action}`}
                  >
                    {action}
                  </LinkComponent>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MobileLedger({
  items,
  LinkComponent,
  recordReturnHref,
}: {
  items: Array<{ item: HostSessionLedgerItem; facts: HostSessionLedgerRowFacts }>;
  LinkComponent: HostSessionLedgerLinkComponent;
  recordReturnHref: string;
}) {
  return (
    <div className="mobile-only rm-record-ledger__cards">
      {items.map(({ item, facts }) => {
        const action = facts.actionLabel ?? hostSessionLedgerActionLabel(item);
        return (
          <article
            key={item.sessionId}
            data-session-id={item.sessionId}
            className="m-card rm-record-ledger__card"
          >
            <div className="eyebrow">No.{item.sessionNumber} · {stateLabel(item.state)}</div>
            <h2 className="h4 editorial rm-record-ledger__card-title">{item.bookTitle}</h2>
            <div className="tiny rm-record-ledger__card-meta">{facts.dateLabel}</div>
            <div className="tiny rm-record-ledger__card-facts">
              {facts.attendanceLabel} · {facts.reflectionLabel} · {facts.draftLabel}
            </div>
            <LinkComponent
              to={sessionRecordHref(item.sessionId)}
              state={readmatesReturnState({ href: recordReturnHref, label: "기록으로" })}
              className="btn btn-primary"
              aria-label={`${formatMeetingOrdinal(item.sessionNumber, "folio")} ${action}`}
            >
              {action}
            </LinkComponent>
          </article>
        );
      })}
    </div>
  );
}

function TrashLedger({
  items,
  onRestore,
  onRetryRestore,
  LinkComponent,
}: {
  items: HostSessionLedgerTrashItem[];
  onRestore?: (sessionId: string) => void;
  onRetryRestore?: (sessionId: string) => void;
  LinkComponent: HostSessionLedgerLinkComponent;
}) {
  return (
    <div className="rm-record-ledger__cards">
      {items.map((item) => (
        <article
          key={item.sessionId}
          data-session-id={item.sessionId}
          className="m-card rm-record-ledger__card"
        >
          <div className="eyebrow">No.{item.sessionNumber} · {stateLabel(item.state)}</div>
          <h2 className="h4 editorial rm-record-ledger__card-title">
            {item.title}
          </h2>
          <div className="tiny rm-record-ledger__card-meta">{item.deletedAtLabel}</div>
          <div className="tiny rm-record-ledger__card-facts">{item.remainingCopy}</div>
          {item.restoreDisabledReason ? (
            <p className="small rm-record-ledger__restore-alert" role="alert">{item.restoreDisabledReason}</p>
          ) : null}
          {item.restoreError ? (
            <p className="small rm-record-ledger__restore-alert" role="alert">{item.restoreError}</p>
          ) : null}
          {item.restoreConflict ? (
            <p className="small rm-record-ledger__restore-alert">
              {item.restoreConflict.message}{" "}
              <LinkComponent to={item.restoreConflict.openSessionHref}>
                진행 중인 모임 열기
              </LinkComponent>
            </p>
          ) : null}
          <div className="rm-record-ledger__restore-actions">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={item.restoreDisabled || item.restoring}
              aria-label={`${formatMeetingOrdinal(item.sessionNumber, "folio")} 복원`}
              onClick={() => onRestore?.(item.sessionId)}
            >
              복원
            </button>
            {item.restoreError && onRetryRestore ? (
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => onRetryRestore(item.sessionId)}
              >
                다시 시도
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function RecordsNextActionCard({
  item,
  nextAction,
  LinkComponent,
  recordReturnHref,
}: {
  item: HostSessionLedgerItem;
  nextAction?: HostSessionLedgerNextAction | null;
  LinkComponent: HostSessionLedgerLinkComponent;
  recordReturnHref: string;
}) {
  const cta = nextAction?.ctaLabel ?? hostSessionLedgerActionLabel(item);
  const href = nextAction?.href ?? sessionRecordHref(item.sessionId);
  const label = nextAction?.label ?? `${item.bookTitle} 기록 초안을 검토해 주세요`;
  return (
    <section
      className="rm-record-ledger__next rm-host-records-next"
      aria-labelledby="rm-host-records-next-title"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) {
          sessionStorage.setItem(HOST_RECORDS_FOCUS_KEY, "closing");
        }
      }}
    >
      <ReadmatesIconBadge name="alert-circle" tone="warn" size={40} />
      <div className="rm-record-ledger__next-copy">
        <p className="rm-record-ledger__eyebrow">다음에 마감할 기록</p>
        <h2 id="rm-host-records-next-title">{label}</h2>
        {nextAction?.meta ? <p>{nextAction.meta}</p> : null}
      </div>
      <LinkComponent
        to={href}
        state={readmatesReturnState({ href: recordReturnHref, label: "기록으로" })}
        className="btn btn-primary"
        aria-label={cta}
      >
        {cta}
      </LinkComponent>
    </section>
  );
}

const noopWorkboxHandler = () => undefined;

export function HostSessionLedger({
  items,
  summary: _summary,
  filters,
  nextCursor,
  loadingMore,
  onFiltersChange,
  onLoadMore,
  LinkComponent = DefaultLink,
  loading = false,
  errorMessage = null,
  loadMoreError = null,
  onRetry,
  trashItems = [],
  trashHref = "?view=trash",
  activeHref = "/app/host/records",
  recordReturnHref = "/app/host/records",
  onRestore,
  onRetryRestore,
  headingRef,
  factsBySessionId,
  nextAction,
  workItems: _workItems,
  statusCounts,
  workTabCounts: _workTabCounts,
  workbox = null,
  workboxState,
  workboxLoading = false,
  workboxError = null,
  onWorkboxStateChange,
  onWorkboxRetry,
  onWorkboxLoadMore,
  exportHref = "#",
}: HostSessionLedgerProps) {
  void _summary;
  void _workItems;
  void _workTabCounts;
  const trashView = filters.view === "trash";
  const [statusFilter, setStatusFilter] = useState<RecordsStatusFilter>("all");
  const compactViewport = useOperatingRoomCompactViewport();
  const [workboxExpanded, setWorkboxExpanded] = useState(false);
  const railWorkbox = workbox ? { ...workbox, nextCursor: null } : null;
  const workboxDisclosure = railWorkbox
    ? buildHostWorkboxDisclosure(railWorkbox, {
      limit: compactViewport ? 3 : 4,
      expanded: workboxExpanded,
    })
    : null;
  const itemIds = items.map((item) => item.sessionId).join("\0");
  useEffect(() => {
    if (sessionStorage.getItem(HOST_RECORDS_FOCUS_KEY) !== "closing") return;
    const target = document.querySelector<HTMLElement>(".rm-host-records-next a, .rm-record-ledger__next a");
    if (!target) return;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        if (!document.contains(target)) return;
        target.focus();
        sessionStorage.removeItem(HOST_RECORDS_FOCUS_KEY);
      });
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [itemIds]);
  const factRows = items.map((item) => ({ item, facts: rowFacts(item, factsBySessionId) }));
  const visibleFactRows = trashView
    ? []
    : factRows.filter(({ item, facts }) => rowMatchesFilter(item, facts, statusFilter));
  const visibleItems = trashView ? trashItems : items;
  const attentionRow = factRows.find(({ item }) => item.sessionId === nextAction?.sessionId)
    ?? factRows.find(({ item }) => item.needsAttention)
    ?? factRows.find(({ item }) => item.hasDraft);
  const derivedCounts: HostSessionLedgerStatusCounts = statusCounts ?? {
    closing: factRows.filter(({ item, facts }) => rowMatchesFilter(item, facts, "closing")).length,
    drafting: factRows.filter(({ item, facts }) => rowMatchesFilter(item, facts, "drafting")).length,
    published: factRows.filter(({ item, facts }) => rowMatchesFilter(item, facts, "published")).length,
  };
  const lastPublished = hostSessionLedgerLastPublishedItem(items);
  const publishLine = hostSessionLedgerLastPublishLine(items);
  const publishHistoryHref = lastPublished ? sessionRecordHref(lastPublished.sessionId) : recordReturnHref;

  return (
    <main className="rm-host-editorial-ledger rm-host-editorial-ledger--context">
      <header className="page-header-compact">
        <div className="container rm-host-editorial-ledger__context">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="h1 editorial rm-host-editorial-ledger__heading"
          >
            {trashView ? "휴지통" : "기록"}
          </h1>
          <p className="small rm-host-editorial-ledger__lede">
            {trashView
              ? "삭제된 모임을 서버가 정한 기간 동안 복원할 수 있습니다."
              : "모임이 끝난 뒤 남겨야 할 기록과 게시 이력을 관리하세요."}
          </p>
        </div>
      </header>
      <section className={trashView ? "container rm-record-ledger--trash" : "container rm-record-ledger"}>
        {trashView ? (
          <div className="rm-record-ledger__trash-toolbar">
            <span className="small">
              삭제된 모임을 남은 기간 동안 복원할 수 있습니다.
            </span>
            <LinkComponent to={activeHref} className="btn btn-quiet btn-sm">
              기록 목록
            </LinkComponent>
          </div>
        ) : (
          <div className="rm-record-ledger__toolbar">
            <div className="rm-record-ledger__tabs" role="tablist" aria-label="기록 상태">
              {([
                { id: "all", label: "전체" },
                { id: "closing", label: "마감 필요", count: derivedCounts.closing, tone: "danger" as const },
                { id: "drafting", label: "작성 중", count: derivedCounts.drafting, tone: "warn" as const },
                { id: "published", label: "게시됨", count: derivedCounts.published, tone: "ok" as const },
              ] as const).map((chip) => {
                const selected = statusFilter === chip.id;
                const name = "count" in chip ? `${chip.label} ${chip.count}` : chip.label;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    role="tab"
                    aria-label={name}
                    aria-selected={selected}
                    onClick={() => setStatusFilter(chip.id)}
                  >
                    {chip.label}
                    {"count" in chip ? (
                      <span className="rm-record-ledger__count" data-tone={chip.tone}>{chip.count}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <a className="rm-record-ledger__export" href={exportHref}>
              <ReadmatesIcon name="export" size={16} />
              내보내기
            </a>
          </div>
        )}
        {!trashView && attentionRow ? (
          <RecordsNextActionCard
            item={attentionRow.item}
            nextAction={nextAction}
            LinkComponent={LinkComponent}
            recordReturnHref={recordReturnHref}
          />
        ) : null}
        <section className="rm-record-ledger__board">
          {trashView ? null : <h2 className="rm-host-records-ledger__title">기록 원장</h2>}
          {errorMessage ? (
            <div className="surface-quiet rm-record-ledger__state" role="alert">
              <p className="small">{errorMessage}</p>
              {onRetry ? <button className="btn btn-ghost btn-sm" type="button" onClick={onRetry}>다시 시도</button> : null}
            </div>
          ) : loading ? (
            <div className="surface-quiet small rm-record-ledger__state" role="status">
              {trashView ? "휴지통을 불러오는 중입니다." : "모임 기록을 불러오는 중입니다."}
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="surface-quiet small rm-record-ledger__state">
              {trashView ? "휴지통이 비어 있습니다." : "조건에 맞는 모임 기록이 없습니다."}
            </div>
          ) : trashView ? (
            <TrashLedger
              items={trashItems}
              onRestore={onRestore}
              onRetryRestore={onRetryRestore}
              LinkComponent={LinkComponent}
            />
          ) : visibleFactRows.length === 0 ? (
            <div className="surface-quiet small rm-record-ledger__state">
              조건에 맞는 모임 기록이 없습니다.
            </div>
          ) : (
            <>
              <DesktopLedger
                items={visibleFactRows}
                LinkComponent={LinkComponent}
                recordReturnHref={recordReturnHref}
              />
              <MobileLedger
                items={visibleFactRows}
                LinkComponent={LinkComponent}
                recordReturnHref={recordReturnHref}
              />
            </>
          )}
          {nextCursor ? (
            <button className="btn btn-ghost" type="button" disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore ? "불러오는 중" : "더 보기"}
            </button>
          ) : null}
          {loadMoreError ? <p className="small" role="alert">{loadMoreError}</p> : null}
          {trashView ? null : (
            <div className="rm-record-ledger__panel">
              <details>
                <summary className="btn btn-quiet btn-sm">기록 필터</summary>
                <LedgerFilters key={filters.search} filters={filters} onFiltersChange={onFiltersChange} />
              </details>
              <LinkComponent to={trashHref} className="btn btn-quiet btn-sm">
                휴지통
              </LinkComponent>
            </div>
          )}
        </section>
        {trashView ? null : (
          <aside className="rm-record-ledger__rail">
            <HostWorkbox
              title="마감 작업"
              state={workboxState ?? workbox?.state ?? "NOW"}
              view={railWorkbox}
              disclosure={workboxDisclosure}
              loading={workboxLoading}
              error={workboxError}
              onStateChange={(nextState) => {
                setWorkboxExpanded(false);
                (onWorkboxStateChange ?? noopWorkboxHandler)(nextState);
              }}
              onRetry={onWorkboxRetry ?? noopWorkboxHandler}
              onLoadMore={onWorkboxLoadMore ?? noopWorkboxHandler}
              onShowAll={() => setWorkboxExpanded(true)}
              LinkComponent={LinkComponent}
            />
          </aside>
        )}
        {trashView ? null : (
          <footer className="rm-record-ledger__footer">
            <ReadmatesIcon name="check-circle" size={16} />
            <span>{publishLine ?? "—"}</span>
            <LinkComponent to={publishHistoryHref}>
              게시 이력
              <ReadmatesIcon name="chevron-right" size={16} />
            </LinkComponent>
          </footer>
        )}
      </section>
    </main>
  );
}

export function HostSessionAttentionSummary({
  page,
  LinkComponent = DefaultLink,
  maxItems = 3,
  allHref,
  hideEmpty = false,
}: {
  page: HostSessionAttentionData;
  LinkComponent?: HostSessionLedgerLinkComponent;
  maxItems?: number;
  allHref?: string;
  hideEmpty?: boolean;
}) {
  const visibleItems = page.items.slice(0, maxItems);

  if (visibleItems.length === 0) {
    return hideEmpty ? null : (
      <p className="rm-host-attention__empty">확인 필요한 모임 기록이 없습니다.</p>
    );
  }

  return (
    <>
      <ol className="rm-host-attention" aria-label="확인 필요한 모임 기록">
        {visibleItems.map((item) => {
          const status = hostSessionLedgerBadges(item)[0] ?? {
            label: "기록 확인",
            tone: "default",
          };

          return (
            <li key={item.sessionId} className="rm-host-attention__item">
              <LinkComponent
                to={sessionRecordHref(item.sessionId)}
                className="rm-host-attention__row"
                aria-label={`${formatMeetingOrdinal(item.sessionNumber, "folio")} 기록 열기`}
              >
                <span className="rm-host-attention__number ledger-number">No.{item.sessionNumber}</span>
                <span className="rm-host-attention__copy">
                  <strong>{item.bookTitle}</strong>
                  <span>{item.bookAuthor}</span>
                </span>
                <span
                  className={`rm-host-attention__status badge${
                    status.tone === "default" ? "" : ` badge-${status.tone}`
                  } badge-dot`}
                >
                  {status.label}
                </span>
                <span className="rm-host-attention__action">
                  기록 열기
                  <span aria-hidden="true">→</span>
                </span>
              </LinkComponent>
            </li>
          );
        })}
      </ol>
      {allHref ? (
        <LinkComponent to={allHref} className="rm-host-attention__all">
          모두 보기
        </LinkComponent>
      ) : null}
    </>
  );
}
