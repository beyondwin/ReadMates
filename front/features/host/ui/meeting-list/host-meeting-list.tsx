import { useEffect, useRef } from "react";
import type { HostLinkComponent, HostLinkProps } from "@/features/host/ui/host-link-types";
import type { HostMeetingTocSections } from "@/features/host/model/host-meeting-list-model";
import { MeetingTocRow } from "./meeting-toc-row";
import "./meeting-toc.css";

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
  LinkComponent,
}: {
  title: string;
  rows: HostMeetingTocSections["upcoming"]["rows"];
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  emptyCopy: string;
  LinkComponent: HostLinkComponent;
}) {
  return (
    <section className="rm-meeting-toc__section" aria-label={title}>
      <div className="rm-meeting-toc__section-head">
        <h2 className="rm-meeting-toc__section-title">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="small rm-meeting-toc__section-empty">{emptyCopy}</p>
      ) : (
        <ol className="rm-meeting-toc__list" aria-label={title}>
          {rows.map((row) => (
            <MeetingTocRow key={row.id} row={row} LinkComponent={LinkComponent} />
          ))}
        </ol>
      )}
      {nextCursor ? (
        <button
          type="button"
          className="btn btn-ghost rm-meeting-toc__more"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? "불러오는 중" : "더 보기"}
        </button>
      ) : null}
    </section>
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
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousFocusRevision = useRef(focusHeadingRevision);
  const isEmpty = sections.upcoming.rows.length === 0 && sections.past.rows.length === 0;
  const showCreate = !loading && !errorMessage && !isEmpty;

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
                모임
              </h1>
              <p className="small rm-meeting-toc__lede">
                다가오는 모임과 지난 모임을 차례로 확인합니다.
              </p>
            </div>
            {showCreate ? (
              <LinkComponent to={newMeetingHref} className="btn btn-primary rm-meeting-toc__action">
                새 모임 만들기
              </LinkComponent>
            ) : null}
          </div>
        </div>
      </section>

      <section className="container rm-meeting-toc__body">
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
        {errorMessage ? (
          <div className="rm-empty-state rm-meeting-toc__state" role="alert">
            <h2 className="h3 editorial rm-meeting-toc__state-title">모임을 불러오지 못했습니다</h2>
            <p className="small">{errorMessage}</p>
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              다시 시도
            </button>
          </div>
        ) : loading ? (
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
          <>
            <TocSection
              title="다가오는 모임"
              rows={sections.upcoming.rows}
              nextCursor={sections.upcoming.nextCursor}
              loadingMore={loadingMoreUpcoming}
              onLoadMore={onLoadMoreUpcoming}
              emptyCopy="다가오는 모임이 없습니다."
              LinkComponent={LinkComponent}
            />
            <TocSection
              title="지난 모임"
              rows={sections.past.rows}
              nextCursor={sections.past.nextCursor}
              loadingMore={loadingMorePast}
              onLoadMore={onLoadMorePast}
              emptyCopy="지난 모임이 없습니다."
              LinkComponent={LinkComponent}
            />
            <div className="rm-meeting-toc__foot">
              <LinkComponent to={trashHref} className="btn btn-quiet btn-sm rm-meeting-toc__trash">
                휴지통
              </LinkComponent>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
