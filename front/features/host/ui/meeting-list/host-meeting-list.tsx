import { useEffect, useMemo, useRef, useState } from "react";
import type { HostLinkComponent, HostLinkProps } from "@/features/host/ui/host-link-types";
import {
  formatMeetingWeekday,
  type HostMeetingTocRow,
  type HostMeetingTocSections,
} from "@/features/host/model/host-meeting-list-model";
import { MeetingLedgerRow, MeetingTocRow } from "./meeting-toc-row";
import "./meeting-toc.css";

type MeetingStatusFilter = "all" | "준비 중" | "마감 필요" | "게시됨";

const STATUS_FILTERS: ReadonlyArray<{ id: MeetingStatusFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "준비 중", label: "준비 중" },
  { id: "마감 필요", label: "마감 필요" },
  { id: "게시됨", label: "게시됨" },
];

function rowMatchesStatus(row: HostMeetingTocRow, filter: MeetingStatusFilter) {
  if (filter === "all") return true;
  if (filter === "마감 필요") {
    return row.lifecycleLabel === "마감 필요" || row.lifecycleLabel === "기록 정리 중";
  }
  return row.lifecycleLabel === filter;
}

function filterMeetingSections(
  sections: HostMeetingTocSections,
  filter: MeetingStatusFilter,
): HostMeetingTocSections {
  if (filter === "all") return sections;
  return {
    upcoming: {
      ...sections.upcoming,
      rows: sections.upcoming.rows.filter((row) => rowMatchesStatus(row, filter)),
    },
    past: {
      ...sections.past,
      rows: sections.past.rows.filter((row) => rowMatchesStatus(row, filter)),
    },
  };
}

function DefaultLink({ to, children, state: _state, ...props }: HostLinkProps) {
  void _state;
  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

export type HostMeetingListLinkComponent = HostLinkComponent;

function TocSection({
  title,
  rows,
  nextCursor,
  loadingMore,
  onLoadMore,
  emptyCopy,
  errorMessage = null,
  onRetry,
  LinkComponent,
}: {
  title: string;
  rows: HostMeetingTocSections["upcoming"]["rows"];
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  emptyCopy: string;
  errorMessage?: string | null;
  onRetry?: () => void;
  LinkComponent: HostLinkComponent;
}) {
  return (
    <section className="rm-meeting-toc__section" aria-label={title}>
      <div className="rm-meeting-toc__section-head">
        <h2 className="rm-meeting-toc__section-title">{title}</h2>
      </div>
      {errorMessage ? (
        <div className="rm-meeting-toc__section-state" role="alert">
          <p className="small">{errorMessage}</p>
          {onRetry ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
              다시 시도
            </button>
          ) : null}
        </div>
      ) : rows.length === 0 ? (
        <p className="small rm-meeting-toc__section-empty">{emptyCopy}</p>
      ) : (
        <table className="rm-meeting-toc__table">
          <thead>
            <tr>
              <th scope="col">모임</th>
              <th scope="col">일정</th>
              <th scope="col">상태</th>
              <th scope="col">요약</th>
              <th scope="col">작업</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <MeetingLedgerRow key={row.id} row={row} LinkComponent={LinkComponent} />
            ))}
          </tbody>
        </table>
      )}
      {!errorMessage && nextCursor ? (
        <button
          type="button"
          className="btn btn-ghost rm-meeting-toc__more"
          aria-label={title === "다가오는 모임" ? "다가오는 모임 더 보기" : "지난 모임 더 보기"}
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? "불러오는 중" : "더 보기"}
        </button>
      ) : null}
    </section>
  );
}

type CalendarRow = HostMeetingTocSections["upcoming"]["rows"][number] & {
  source: "upcoming" | "past";
};

function calendarMonthLabel(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  return match ? `${Number(match[1])}년 ${Number(match[2])}월` : month;
}

function thisMonthKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

const THIS_MONTH_CHIPS = ["현재 모임", "다음 모임"] as const;

function ThisMonthRail({
  sections,
  now,
  onShowCalendar,
  LinkComponent,
}: {
  sections: HostMeetingTocSections;
  now: Date;
  onShowCalendar: () => void;
  LinkComponent: HostLinkComponent;
}) {
  const month = thisMonthKey(now);
  const rows = sections.upcoming.rows
    .filter((row) => row.date.startsWith(month))
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));

  return (
    <aside className="rm-meeting-toc__rail" aria-labelledby="this-month-title">
      <h2 id="this-month-title">이번 달</h2>
      <p className="small">{`${Number(month.slice(5))}월`}</p>
      {rows.length === 0 ? (
        <p className="small rm-meeting-toc__section-empty">이번 달 모임이 없습니다.</p>
      ) : (
        <ol className="rm-meeting-toc__rail-list" aria-label="이번 달 모임">
          {rows.map((row, index) => (
            <li key={row.id} className="rm-meeting-toc__rail-item">
              <div className="rm-meeting-toc__rail-when">
                <time dateTime={row.date}>{row.dateLabel ?? formatMeetingWeekday(row.date)}</time>
                {THIS_MONTH_CHIPS[index] ? (
                  <span className="rm-meeting-toc__rail-chip">{THIS_MONTH_CHIPS[index]}</span>
                ) : null}
              </div>
              <LinkComponent to={row.href} className="rm-meeting-toc__rail-title">
                {row.ordinalFolio} · {row.title}
              </LinkComponent>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="rm-meeting-toc__rail-calendar" onClick={onShowCalendar}>
        달력에서 보기
      </button>
    </aside>
  );
}

function CalendarView({
  sections,
  loadingMoreUpcoming,
  loadingMorePast,
  onLoadMoreUpcoming,
  onLoadMorePast,
  errorMessage,
  pastErrorMessage,
  onRetry,
  onRetryPast,
  LinkComponent,
}: {
  sections: HostMeetingTocSections;
  loadingMoreUpcoming: boolean;
  loadingMorePast: boolean;
  onLoadMoreUpcoming: () => void;
  onLoadMorePast: () => void;
  errorMessage: string | null;
  pastErrorMessage: string | null;
  onRetry?: () => void;
  onRetryPast?: () => void;
  LinkComponent: HostLinkComponent;
}) {
  const rows: CalendarRow[] = [
    ...sections.upcoming.rows.map((row) => ({ ...row, source: "upcoming" as const })),
    ...sections.past.rows.map((row) => ({ ...row, source: "past" as const })),
  ].sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const groups = new Map<string, Map<string, CalendarRow[]>>();
  for (const row of rows) {
    const month = /^\d{4}-\d{2}/.exec(row.date)?.[0] ?? row.date;
    const monthRows = groups.get(month) ?? new Map<string, CalendarRow[]>();
    monthRows.set(row.date, [...(monthRows.get(row.date) ?? []), row]);
    groups.set(month, monthRows);
  }
  const incomplete = Boolean(sections.upcoming.nextCursor || sections.past.nextCursor);

  return (
    <div className="rm-meeting-calendar" role="tabpanel" aria-label="달력">
      {incomplete ? (
        <p className="small rm-meeting-calendar__disclosure">
          현재 불러온 모임만 표시합니다. 더 있는 서버 페이지는 아래에서 이어서 불러올 수 있습니다.
        </p>
      ) : null}
      {errorMessage ? (
        <div className="rm-meeting-toc__section-state" role="alert">
          <p className="small">{errorMessage}</p>
          {onRetry ? <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>다시 시도</button> : null}
        </div>
      ) : null}
      {pastErrorMessage ? (
        <div className="rm-meeting-toc__section-state" role="alert">
          <p className="small">{pastErrorMessage}</p>
          {onRetryPast ? <button type="button" className="btn btn-ghost btn-sm" onClick={onRetryPast}>다시 시도</button> : null}
        </div>
      ) : null}
      {groups.size === 0 && !errorMessage && !pastErrorMessage ? (
        <p className="small rm-meeting-toc__section-empty">달력에 표시할 모임이 없습니다.</p>
      ) : null}
      {[...groups.entries()].map(([month, dates]) => (
        <section key={month} className="rm-meeting-calendar__month" aria-labelledby={`meeting-month-${month}`}>
          <h2 id={`meeting-month-${month}`} className="rm-meeting-toc__section-title">
            {calendarMonthLabel(month)}
          </h2>
          {[...dates.entries()].map(([date, dateRows]) => (
            <div key={date} className="rm-meeting-calendar__date">
              <time className="mono rm-meeting-calendar__date-label" dateTime={date}>{date}</time>
              <ol className="rm-meeting-toc__list" aria-label={`${date} 모임`}>
                {dateRows.map((row) => (
                  <MeetingTocRow key={`${row.source}:${row.id}`} row={row} LinkComponent={LinkComponent} />
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}
      <div className="rm-meeting-calendar__continuations">
        {sections.upcoming.nextCursor ? (
          <button
            type="button"
            className="btn btn-ghost rm-meeting-toc__more"
            aria-label="다가오는 모임 더 보기"
            disabled={loadingMoreUpcoming}
            onClick={onLoadMoreUpcoming}
          >
            {loadingMoreUpcoming ? "불러오는 중" : "다가오는 모임 더 보기"}
          </button>
        ) : null}
        {sections.past.nextCursor ? (
          <button
            type="button"
            className="btn btn-ghost rm-meeting-toc__more"
            aria-label="지난 모임 더 보기"
            disabled={loadingMorePast}
            onClick={onLoadMorePast}
          >
            {loadingMorePast ? "불러오는 중" : "지난 모임 더 보기"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function HostMeetingList({
  sections,
  onLoadMoreUpcoming,
  onLoadMorePast,
  loadingMoreUpcoming,
  loadingMorePast,
  trashHref,
  newMeetingHref,
  LinkComponent = DefaultLink,
  announcement = null,
  focusHeadingRevision = 0,
  loading = false,
  errorMessage = null,
  onRetry,
  pastErrorMessage = null,
  onRetryPast,
  now = new Date(),
}: {
  sections: HostMeetingTocSections;
  onLoadMoreUpcoming: () => void;
  onLoadMorePast: () => void;
  loadingMoreUpcoming: boolean;
  loadingMorePast: boolean;
  trashHref: string;
  newMeetingHref: string;
  LinkComponent?: HostMeetingListLinkComponent;
  announcement?: string | null;
  focusHeadingRevision?: number;
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  pastErrorMessage?: string | null;
  onRetryPast?: () => void;
  now?: Date;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [statusFilter, setStatusFilter] = useState<MeetingStatusFilter>("all");
  const previousFocusRevision = useRef(focusHeadingRevision);
  const isEmpty = !pastErrorMessage
    && !errorMessage
    && sections.upcoming.rows.length === 0
    && sections.past.rows.length === 0;
  const showCreate = !loading && !isEmpty;
  const visibleSections = useMemo(
    () => filterMeetingSections(sections, statusFilter),
    [sections, statusFilter],
  );

  useEffect(() => {
    if (focusHeadingRevision > previousFocusRevision.current) {
      headingRef.current?.focus();
    }
    previousFocusRevision.current = focusHeadingRevision;
  }, [focusHeadingRevision]);

  return (
    <main className="rm-meeting-toc">
      <section className="page-header-compact">
        <div className="container rm-meeting-toc__context">
          <div className="rm-meeting-toc__toolbar">
            <div>
              <div className="eyebrow rm-meeting-toc__eyebrow">호스트 · 예정과 기록</div>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="h1 editorial rm-meeting-toc__heading"
              >
                일정과 모임
              </h1>
              <p className="small rm-meeting-toc__lede">
                다가오는 일정과 지난 모임을 한 흐름에서 관리하세요.
              </p>
            </div>
            <div className="rm-meeting-toc__view-tabs" role="tablist" aria-label="모임 보기 방식">
              <button
                type="button"
                role="tab"
                aria-selected={view === "list"}
                className="btn btn-quiet btn-sm"
                onClick={() => setView("list")}
              >
                목록
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "calendar"}
                className="btn btn-quiet btn-sm"
                onClick={() => setView("calendar")}
              >
                달력
              </button>
            </div>
            <div className="rm-meeting-toc__filters" role="tablist" aria-label="모임 상태">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === filter.id}
                  className="btn btn-quiet btn-sm"
                  onClick={() => setStatusFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          {showCreate ? (
            <LinkComponent to={newMeetingHref} className="btn btn-primary rm-meeting-toc__action">
              새 모임 만들기
            </LinkComponent>
          ) : null}
        </div>
      </section>

      <section className="container rm-meeting-toc__body">
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
        {loading ? (
          <div className="rm-empty-state rm-meeting-toc__state" role="status">
            모임을 불러오는 중
          </div>
        ) : isEmpty ? (
          <div className="rm-empty-state rm-meeting-toc__state">
            <h2 className="h3 editorial rm-meeting-toc__state-title">첫 모임을 준비해 보세요</h2>
            <LinkComponent to={newMeetingHref} className="btn btn-primary rm-meeting-toc__action">
              첫 모임 만들기
            </LinkComponent>
          </div>
        ) : (
          <div className="rm-meeting-toc__layout">
            {view === "calendar" ? (
              <CalendarView
                sections={visibleSections}
                loadingMoreUpcoming={loadingMoreUpcoming}
                loadingMorePast={loadingMorePast}
                onLoadMoreUpcoming={onLoadMoreUpcoming}
                onLoadMorePast={onLoadMorePast}
                errorMessage={errorMessage}
                pastErrorMessage={pastErrorMessage}
                onRetry={onRetry}
                onRetryPast={onRetryPast}
                LinkComponent={LinkComponent}
              />
            ) : (
              <div role="tabpanel" aria-label="목록" className="rm-meeting-toc__list-panel">
                <TocSection
                  title="다가오는 모임"
                  rows={visibleSections.upcoming.rows}
                  nextCursor={sections.upcoming.nextCursor}
                  loadingMore={loadingMoreUpcoming}
                  onLoadMore={onLoadMoreUpcoming}
                  emptyCopy="다가오는 모임이 없습니다."
                  errorMessage={errorMessage}
                  onRetry={onRetry}
                  LinkComponent={LinkComponent}
                />
                <TocSection
                  title="지난 모임"
                  rows={visibleSections.past.rows}
                  nextCursor={sections.past.nextCursor}
                  loadingMore={loadingMorePast}
                  onLoadMore={onLoadMorePast}
                  emptyCopy="지난 모임이 없습니다."
                  errorMessage={pastErrorMessage}
                  onRetry={onRetryPast}
                  LinkComponent={LinkComponent}
                />
                <div className="rm-meeting-toc__foot">
                  <LinkComponent to={trashHref} className="btn btn-quiet btn-sm rm-meeting-toc__trash">
                    휴지통
                  </LinkComponent>
                </div>
              </div>
            )}
            <ThisMonthRail
              sections={visibleSections}
              now={now}
              onShowCalendar={() => setView("calendar")}
              LinkComponent={LinkComponent}
            />
          </div>
        )}
      </section>
    </main>
  );
}
