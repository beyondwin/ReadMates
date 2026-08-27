import type { ReactNode } from "react";
import type { HostTodayView } from "@/features/host/model/host-today-model";
import type { HostLinkComponent, HostLinkProps } from "@/features/host/ui/host-link-types";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { HostTodayQueue } from "./host-today-queue";
import "./host-today.css";

function DefaultLink({ to, children, ...props }: HostLinkProps) {
  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

function attendanceSectionHref(detailHref: string): string {
  const separator = detailHref.includes("?") ? "&" : "?";
  return `${detailHref}${separator}section=attendance`;
}

function MeetingDayHero({
  nextMeeting,
  LinkComponent,
}: {
  nextMeeting: NonNullable<HostTodayView["nextMeeting"]>;
  LinkComponent: HostLinkComponent;
}) {
  return (
    <section className="rm-host-today__hero" aria-label="오늘 모임">
      <h2 className="h3 editorial rm-host-today__hero-title">오늘 모임</h2>
      <p className="rm-host-editorial-ledger__identity">{nextMeeting.statusLabel}</p>
      <div className="rm-host-today__hero-actions">
        <LinkComponent
          to={attendanceSectionHref(nextMeeting.detailHref)}
          className="btn btn-primary rm-host-today__action rm-host-today__action--block"
        >
          출석 확인 열기
        </LinkComponent>
      </div>
    </section>
  );
}

function NextMeetingFallback({
  nextMeeting,
  LinkComponent,
}: {
  nextMeeting: HostTodayView["nextMeeting"];
  LinkComponent: HostLinkComponent;
}) {
  if (!nextMeeting) {
    return (
      <section className="rm-host-today__hero rm-host-editorial-ledger__state" aria-label="다음 모임">
        <h2 className="h3 editorial rm-host-editorial-ledger__state-title">아직 열린 모임이 없습니다</h2>
        <LinkComponent to="/app/host/sessions/new" className="btn btn-primary rm-host-today__action">
          첫 모임 만들기
        </LinkComponent>
      </section>
    );
  }

  if (nextMeeting.isMeetingDay) {
    return <MeetingDayHero nextMeeting={nextMeeting} LinkComponent={LinkComponent} />;
  }

  return (
    <section className="rm-host-today__hero" aria-label="다음 모임">
      <p className="eyebrow rm-host-today__hero-eyebrow">다음 모임</p>
      <p className="rm-host-editorial-ledger__identity">{nextMeeting.statusLabel}</p>
      <div className="rm-host-today__hero-actions">
        <LinkComponent
          to={nextMeeting.detailHref}
          className="btn btn-primary rm-host-today__action rm-host-today__action--block"
        >
          모임 상세 열기
        </LinkComponent>
      </div>
    </section>
  );
}

function ReferenceRail({
  view,
  LinkComponent,
}: {
  view: HostTodayView;
  LinkComponent: HostLinkComponent;
}) {
  return (
    <aside className="rm-host-today__rail" aria-label="참고">
      <section className="rm-host-today__rail-section" aria-label="다가오는 일정">
        <h2 className="rm-host-today__section-title">다가오는 일정</h2>
        {view.upcoming.length === 0 ? (
          <p className="small rm-host-today__rail-empty">예정된 다음 모임이 없습니다.</p>
        ) : (
          <ul className="rm-host-today__upcoming">
            {view.upcoming.map((item) => (
              <li key={item.sessionId}>
                <LinkComponent to={item.href} className="rm-host-today__upcoming-row">
                  {item.ordinalLabel ? (
                    <span className="tiny mono rm-host-today__upcoming-ordinal">{item.ordinalLabel}</span>
                  ) : null}
                  <span className="tiny mono rm-host-today__upcoming-date">
                    {formatDateOnlyLabel(item.date)}
                  </span>
                </LinkComponent>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rm-host-today__rail-section" aria-label="클럽 상태">
        <h2 className="rm-host-today__section-title">클럽 상태</h2>
        <dl className="rm-host-today__status-dl">
          <div className="rm-host-today__status-row">
            <dt>다음 모임</dt>
            <dd>{view.nextMeeting?.statusLabel ?? "없음"}</dd>
          </div>
          <div className="rm-host-today__status-row">
            <dt>처리할 일</dt>
            <dd className="mono">{view.queue.totalCount}건</dd>
          </div>
        </dl>
      </section>

      <LinkComponent to={view.queue.allHref} className="rm-host-today__ops-link">
        운영 기록 전체 보기
      </LinkComponent>
    </aside>
  );
}

export function HostTodayPage({
  view,
  nextMeetingBlock,
  widgetErrors,
  onRetryQueue,
  LinkComponent = DefaultLink,
}: {
  view: HostTodayView;
  nextMeetingBlock?: ReactNode;
  widgetErrors?: { queue?: boolean };
  onRetryQueue?: () => void;
  LinkComponent?: HostLinkComponent;
}) {
  // Meeting-day hero owns the home primary CTA; route nextMeetingBlock must not override it.
  const hero = view.nextMeeting?.isMeetingDay
    ? (
      <MeetingDayHero nextMeeting={view.nextMeeting} LinkComponent={LinkComponent} />
    )
    : (nextMeetingBlock ?? (
      <NextMeetingFallback nextMeeting={view.nextMeeting} LinkComponent={LinkComponent} />
    ));


  return (
    <main className="rm-host-today rm-host-editorial-ledger">
      <section className="page-header-compact rm-host-today__header">
        <div className="container rm-host-editorial-ledger__stack">
          <div className="rm-host-editorial-ledger__context">
            <p className="eyebrow rm-host-editorial-ledger__eyebrow">호스트 · 오늘</p>
            <h1 className="h1 editorial rm-host-editorial-ledger__heading">오늘</h1>
            <p className="small rm-host-editorial-ledger__lede">{view.headline}</p>
          </div>

          <HostTodayQueue
            items={view.queue.items}
            totalCount={view.queue.totalCount}
            emptyCheckedAtLabel={view.queue.emptyCheckedAtLabel}
            allHref={view.queue.allHref}
            widgetError={Boolean(widgetErrors?.queue)}
            onRetry={onRetryQueue}
            LinkComponent={LinkComponent}
          />
        </div>
      </section>

      <section className="rm-host-today__body">
        <div className="container">
          <div className="home-grid rm-host-today__grid">
            <div className="rm-host-today__main">
              {hero}
            </div>
            <div className="desktop-only">
              <ReferenceRail view={view} LinkComponent={LinkComponent} />
            </div>
          </div>

          <div className="mobile-only rm-host-today__mobile-rail">
            <ReferenceRail view={view} LinkComponent={LinkComponent} />
          </div>
        </div>
      </section>
    </main>
  );
}
