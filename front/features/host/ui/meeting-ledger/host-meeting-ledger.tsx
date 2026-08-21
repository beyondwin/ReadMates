import type { ComponentType, ReactNode } from "react";
import {
  previousRecordAttentionHref,
  resolveViewedMeeting,
  type MeetingListItem,
} from "@/features/host/model/host-meeting-ledger-model";
import { draftsByDate } from "@/features/host/model/upcoming-book-list-model";
import type { HostSessionScheduleDefaults } from "@/features/host/model/host-schedule-defaults-model";
import type { SessionAccessScope } from "@/features/host/model/session-exposure-model";
import type {
  UpcomingBookCreateInput,
  UpcomingBookListItem,
} from "@/features/host/model/upcoming-book-list-model";
import { MeetingPhaseRail } from "./meeting-phase-rail";
import { UpcomingBookList } from "./upcoming-book-list";

const NEW_MEETING_HREF = "/app/host/sessions/new";

export type HostMeetingLedgerLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

export type HostMeetingLedgerLinkComponent = ComponentType<HostMeetingLedgerLinkProps>;

function DefaultLink({ to, children, ...props }: HostMeetingLedgerLinkProps) {
  return <a {...props} href={to}>{children}</a>;
}

function ignoreUpcomingAccessScope() {}
function ignoreUpcomingCreate() {}

export function HostMeetingLedger({
  items,
  sessionId,
  LinkComponent = DefaultLink,
  children,
  upcomingItems = [],
  onSaveUpcomingAccessScope = ignoreUpcomingAccessScope,
  onCreateUpcomingSession = ignoreUpcomingCreate,
  upcomingPending = false,
  scheduleDefaults = null,
}: {
  items: readonly MeetingListItem[];
  sessionId?: string;
  LinkComponent?: HostMeetingLedgerLinkComponent;
  children?: ReactNode;
  upcomingItems?: readonly UpcomingBookListItem[];
  onSaveUpcomingAccessScope?: (input: { sessionId: string; accessScope: SessionAccessScope }) => void | Promise<void>;
  onCreateUpcomingSession?: (input: UpcomingBookCreateInput) => void | Promise<void>;
  upcomingPending?: boolean;
  scheduleDefaults?: HostSessionScheduleDefaults | null;
}) {
  const active = resolveViewedMeeting(items, sessionId);

  if (!active) {
    if (sessionId) {
      return children ?? null;
    }

    return (
      <main>
        <section className="page-header-compact">
          <div className="container">
            <div className="rm-empty-state rm-meeting-ledger__empty">
              <p className="eyebrow" style={{ margin: 0 }}>모임 장부</p>
              <h1 className="h1 editorial" style={{ margin: "8px 0 16px" }}>
                아직 열린 모임이 없습니다
              </h1>
              <LinkComponent to={NEW_MEETING_HREF} className="btn btn-primary">
                첫 모임 만들기
              </LinkComponent>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const previousHref = previousRecordAttentionHref(active, items);
  const showUpcoming = active.phase === "during" || active.phase === "after";
  const hasNextBooks = draftsByDate(upcomingItems).length > 0;
  const upcoming = showUpcoming ? (
    <UpcomingBookList
      items={upcomingItems}
      onSaveAccessScope={onSaveUpcomingAccessScope}
      onCreateSession={onCreateUpcomingSession}
      pending={upcomingPending}
      scheduleDefaults={scheduleDefaults}
      defaultAccessScope={scheduleDefaults?.automatic.accessScope}
      compact={active.phase === "after" && hasNextBooks}
    />
  ) : null;

  return (
    <div className="rm-meeting-ledger">
      <header className="page-header-compact">
        <div className="container">
          {previousHref ? (
            <p className="rm-meeting-ledger__attention">
              <LinkComponent to={previousHref}>
                이전 모임 기록 남음
              </LinkComponent>
            </p>
          ) : null}
          <div className="eyebrow">모임 장부</div>
          <h1 className="h1 editorial">지금 다루는 모임</h1>
          <MeetingPhaseRail activePhase={active.phase} />
        </div>
      </header>
      {active.phase === "after" ? (
        <div
          className={`rm-meeting-ledger__stage rm-meeting-ledger__stage--after${hasNextBooks ? "" : " rm-meeting-ledger__stage--no-next"}`}
        >
          <div className="rm-meeting-ledger__this">{children}</div>
          <div className="rm-meeting-ledger__next">{upcoming}</div>
        </div>
      ) : (
        <>
          {children}
          {upcoming}
        </>
      )}
    </div>
  );
}
