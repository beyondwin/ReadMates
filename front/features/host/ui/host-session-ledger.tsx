import { useEffect, useState, type ComponentType, type FormEvent, type ReactNode, type Ref } from "react";
import {
  hostSessionLedgerActionLabel,
  hostSessionLedgerDraftLabel,
  hostSessionLedgerFeedbackLabel,
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
import { formatMeetingOrdinal, hostMeetingLifecycleLabel } from "@/shared/model/meeting-language";
import { readmatesReturnState } from "@/shared/routing/readmates-route-state";
import "./host-editorial-ledger.css";

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
};

const HOST_RECORDS_FOCUS_KEY = "readmates.host-records.focus-restore";

type RecordsStatusFilter = "all" | "closing" | "drafting" | "published";

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
    <form
      role="search"
      onSubmit={submit}
      className="rm-document-panel"
      style={{
        padding: 16,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
        gap: 10,
        alignItems: "end",
      }}
    >
      <label className="stack" style={{ "--stack": "6px", minWidth: 0 } as React.CSSProperties}>
        <span className="tiny">모임 기록 검색</span>
        <span className="row" style={{ gap: 8, minWidth: 0 }}>
          <input
            className="input"
            type="search"
            aria-label="모임 기록 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ minWidth: 0 }}
          />
          <button className="btn btn-primary btn-sm" type="submit">검색</button>
        </span>
      </label>
      <label className="stack" style={{ "--stack": "6px" } as React.CSSProperties}>
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
      <label className="stack" style={{ "--stack": "6px" } as React.CSSProperties}>
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
                <td>{facts.attendanceLabel}</td>
                <td>{facts.reflectionLabel}</td>
                <td>{facts.draftLabel}</td>
                <td>{facts.feedbackLabel}</td>
                <td>{facts.publicationLabel}</td>
                <td>
                  <LinkComponent
                    to={sessionRecordHref(item.sessionId)}
                    state={readmatesReturnState({ href: recordReturnHref, label: "기록으로" })}
                    className="btn btn-ghost btn-sm"
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
    <div className="mobile-only stack" style={{ "--stack": "10px", minWidth: 0 } as React.CSSProperties}>
      {items.map(({ item, facts }) => {
        const action = facts.actionLabel ?? hostSessionLedgerActionLabel(item);
        return (
          <article
            key={item.sessionId}
            data-session-id={item.sessionId}
            className="m-card"
            style={{ minWidth: 0, overflowWrap: "anywhere" }}
          >
            <div className="eyebrow">No.{item.sessionNumber} · {stateLabel(item.state)}</div>
            <h2 className="h4 editorial" style={{ margin: "5px 0 2px", overflowWrap: "anywhere" }}>{item.bookTitle}</h2>
            <div className="tiny" style={{ marginTop: 10 }}>{facts.dateLabel}</div>
            <div className="tiny" style={{ marginTop: 4 }}>
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
    <div className="stack" style={{ "--stack": "10px", minWidth: 0 } as React.CSSProperties}>
      {items.map((item) => (
        <article
          key={item.sessionId}
          data-session-id={item.sessionId}
          className="m-card"
          style={{ minWidth: 0, overflowWrap: "anywhere" }}
        >
          <div className="eyebrow">No.{item.sessionNumber} · {stateLabel(item.state)}</div>
          <h2 className="h4 editorial" style={{ margin: "5px 0 2px", overflowWrap: "anywhere" }}>
            {item.title}
          </h2>
          <div className="tiny" style={{ marginTop: 8 }}>{item.deletedAtLabel}</div>
          <div className="tiny" style={{ marginTop: 4 }}>{item.remainingCopy}</div>
          {item.restoreDisabledReason ? (
            <p className="small" role="alert" style={{ margin: "10px 0 0" }}>{item.restoreDisabledReason}</p>
          ) : null}
          {item.restoreError ? (
            <p className="small" role="alert" style={{ margin: "10px 0 0" }}>{item.restoreError}</p>
          ) : null}
          {item.restoreConflict ? (
            <p className="small" style={{ margin: "10px 0 0" }}>
              {item.restoreConflict.message}{" "}
              <LinkComponent to={item.restoreConflict.openSessionHref}>
                진행 중인 모임 열기
              </LinkComponent>
            </p>
          ) : null}
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
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
      className="rm-host-records-next"
      aria-labelledby="rm-host-records-next-title"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) {
          sessionStorage.setItem(HOST_RECORDS_FOCUS_KEY, "closing");
        }
      }}
    >
      <p className="rm-host-records-next__eyebrow">다음에 마감할 기록</p>
      <div className="rm-host-records-next__body">
        <div className="rm-host-records-next__copy">
          <span className="rm-host-records-next__mark" aria-hidden="true">!</span>
          <div>
            <h2 id="rm-host-records-next-title">{label}</h2>
            {nextAction?.meta ? <p>{nextAction.meta}</p> : null}
          </div>
        </div>
        <LinkComponent
          to={href}
          state={readmatesReturnState({ href: recordReturnHref, label: "기록으로" })}
          className="btn btn-primary"
          aria-label={cta}
        >
          {cta}
        </LinkComponent>
      </div>
    </section>
  );
}

export function HostSessionLedger({
  items,
  summary,
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
  workItems,
  statusCounts,
  workTabCounts,
}: HostSessionLedgerProps) {
  const trashView = filters.view === "trash";
  const [statusFilter, setStatusFilter] = useState<RecordsStatusFilter>("all");
  const itemIds = items.map((item) => item.sessionId).join("\0");
  useEffect(() => {
    if (sessionStorage.getItem(HOST_RECORDS_FOCUS_KEY) !== "closing") return;
    const target = document.querySelector<HTMLElement>(".rm-host-records-next a");
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
  const railItems = workItems ?? [
    { title: "확인 필요", meta: `${summary?.needsAttentionCount ?? 0}건` },
    { title: "초안", meta: `${summary?.draftCount ?? 0}건` },
    { title: "게시 미완료", meta: `${summary?.incompletePublishedCount ?? 0}건` },
  ];

  return (
    <main className="rm-host-editorial-ledger rm-host-editorial-ledger--context">
      <section className="page-header-compact">
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
      </section>
      <section className="container rm-host-editorial-ledger__body">
        {trashView ? (
          <div className="row-between" style={{ gap: 10, flexWrap: "wrap", minWidth: 0 }}>
            <span className="small" style={{ color: "var(--text-2)" }}>
              삭제된 모임을 남은 기간 동안 복원할 수 있습니다.
            </span>
            <LinkComponent to={activeHref} className="btn btn-quiet btn-sm">
              기록 목록
            </LinkComponent>
          </div>
        ) : (
          <div className="rm-host-records-toolbar">
            <div className="rm-host-editorial-ledger__filters" role="tablist" aria-label="기록 상태">
              {([
                { id: "all", label: "전체" },
                { id: "closing", label: "마감 필요", count: derivedCounts.closing },
                { id: "drafting", label: "작성 중", count: derivedCounts.drafting },
                { id: "published", label: "게시됨", count: derivedCounts.published },
              ] as const).map((chip) => {
                const selected = statusFilter === chip.id;
                const name = "count" in chip && chip.count != null ? `${chip.label} ${chip.count}` : chip.label;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    role="tab"
                    aria-label={name}
                    aria-selected={selected}
                    className={`rm-host-editorial-ledger__filter${selected ? " is-selected" : ""}`}
                    onClick={() => setStatusFilter(chip.id)}
                  >
                    {chip.label}
                    {"count" in chip && chip.count != null ? ` ${chip.count}` : ""}
                  </button>
                );
              })}
            </div>
            <button type="button" className="btn btn-quiet btn-sm">내보내기</button>
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
        <div className="rm-host-editorial-ledger--split">
          <div>
            {trashView ? null : <h2 className="rm-host-records-ledger__title">기록 원장</h2>}
            {errorMessage ? (
              <div className="surface-quiet" role="alert" style={{ padding: 18 }}>
                <p className="small" style={{ margin: 0 }}>{errorMessage}</p>
                {onRetry ? <button className="btn btn-ghost btn-sm" type="button" onClick={onRetry}>다시 시도</button> : null}
              </div>
            ) : loading ? (
              <div className="surface-quiet small" role="status" style={{ padding: 18 }}>
                {trashView ? "휴지통을 불러오는 중입니다." : "모임 기록을 불러오는 중입니다."}
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="surface-quiet small" style={{ padding: 18 }}>
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
              <div className="surface-quiet small" style={{ padding: 18 }}>
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
              <div className="rm-host-editorial-ledger__panel">
                {!summary ? null : (
                  <section className="rm-document-panel" aria-label="기록 장부 요약" style={{ padding: 18 }}>
                    <h2 className="h4 editorial" style={{ margin: 0 }}>기록 장부 요약</h2>
                    <p className="small" style={{ margin: "8px 0 0", color: "var(--text-2)" }}>
                      {summary.needsAttentionCount === 0
                        ? "확인 필요한 기록 없음"
                        : `확인 필요 ${summary.needsAttentionCount}건`}
                      {` · 게시 기록 미완료 ${summary.incompletePublishedCount}건 · 초안 ${summary.draftCount}건`}
                    </p>
                  </section>
                )}
                <details className="rm-host-editorial-ledger__panel">
                  <summary className="btn btn-quiet btn-sm">기록 필터</summary>
                  <LedgerFilters key={filters.search} filters={filters} onFiltersChange={onFiltersChange} />
                </details>
                <LinkComponent to={trashHref} className="btn btn-quiet btn-sm">
                  휴지통
                </LinkComponent>
              </div>
            )}
          </div>
          {trashView ? null : (
            <aside className="rm-host-editorial-ledger__rail" aria-labelledby="closing-work-title">
              <h2 id="closing-work-title">마감 작업</h2>
              <div className="rm-host-editorial-ledger__filters" role="tablist" aria-label="마감 작업 상태">
                <button type="button" role="tab" aria-selected="true" className="rm-host-editorial-ledger__filter is-selected">
                  지금 {workTabCounts?.now ?? summary?.needsAttentionCount ?? railItems.length}
                </button>
                <button type="button" role="tab" aria-selected="false" className="rm-host-editorial-ledger__filter">
                  보류 {workTabCounts?.deferred ?? 0}
                </button>
                <button type="button" role="tab" aria-selected="false" className="rm-host-editorial-ledger__filter">
                  완료
                </button>
              </div>
              <ul className="rm-host-editorial-ledger__list">
                {railItems.map((work) => (
                  <li key={work.title} className="rm-host-editorial-ledger__row">
                    {work.href ? (
                      <LinkComponent to={work.href} className="rm-host-records-work">
                        <span>{work.title}</span>
                        <span>{work.meta}</span>
                      </LinkComponent>
                    ) : (
                      <>
                        <span>{work.title}</span>
                        <span>{work.meta}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
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
