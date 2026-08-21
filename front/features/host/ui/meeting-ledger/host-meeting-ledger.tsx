import type { ComponentType, ReactNode } from "react";
import {
  previousRecordAttentionHref,
  resolveViewedMeeting,
  type MeetingListItem,
} from "@/features/host/model/host-meeting-ledger-model";
import type { HostSessionAttentionData } from "@/features/host/model/host-session-ledger-model";
import { draftsByDate } from "@/features/host/model/upcoming-book-list-model";
import type { HostSessionScheduleDefaults } from "@/features/host/model/host-schedule-defaults-model";
import type { SessionAccessScope } from "@/features/host/model/session-exposure-model";
import type {
  UpcomingBookCreateInput,
  UpcomingBookListItem,
} from "@/features/host/model/upcoming-book-list-model";
import { HostSessionAttentionSummary } from "../host-session-ledger";
import { MeetingPhaseRail } from "./meeting-phase-rail";
import { UpcomingBookList } from "./upcoming-book-list";

const NEW_MEETING_HREF = "/app/host/sessions/new";
const OPERATIONS_HREF = "/app/host/operations";

export type HostMeetingLedgerLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
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
  scheduleDefaultsStatus,
  scheduleDefaultsWarning,
  onRetryScheduleDefaults,
  attentionPage,
  sessionAttention,
  attentionError = false,
  onRetryAttention,
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
  scheduleDefaultsStatus?: "loading" | "ready" | "warning";
  scheduleDefaultsWarning?: string | null;
  onRetryScheduleDefaults?: () => void;
  attentionPage?: HostSessionAttentionData | null;
  sessionAttention?: HostSessionAttentionData | null;
  attentionError?: boolean;
  onRetryAttention?: () => void;
}) {
  const active = resolveViewedMeeting(items, sessionId);

  if (!active) {
    if (sessionId) {
      return children ?? null;
    }

    const attentionCount = attentionPage?.summary.needsAttentionCount ?? 0;

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
            {attentionError ? (
              <div className="rm-host-ledger__error" role="alert" style={{ marginTop: 28 }}>
                <span>확인 필요 목록을 불러오지 못했습니다.</span>
                {onRetryAttention ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onRetryAttention}>
                    다시 시도
                  </button>
                ) : null}
              </div>
            ) : attentionPage && attentionCount > 0 ? (
              <section aria-label="확인 필요" style={{ marginTop: 28 }}>
                <p className="small" style={{ margin: "0 0 12px", color: "var(--text-2)" }}>
                  확인 필요 {attentionCount}건
                </p>
                <HostSessionAttentionSummary
                  page={attentionPage}
                  maxItems={1}
                  allHref={attentionCount > 1 ? OPERATIONS_HREF : undefined}
                  LinkComponent={LinkComponent}
                />
              </section>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  const previousHref = previousRecordAttentionHref(active, items);
  const selectedAttention = sessionAttention ?? null;
  const showUpcoming = active.phase === "during" || active.phase === "after";
  const hasNextBooks = draftsByDate(upcomingItems).length > 0;
  const upcoming = showUpcoming ? (
    <UpcomingBookList
      items={upcomingItems}
      onSaveAccessScope={onSaveUpcomingAccessScope}
      onCreateSession={onCreateUpcomingSession}
      pending={upcomingPending}
      scheduleDefaults={scheduleDefaults}
      scheduleDefaultsStatus={scheduleDefaultsStatus}
      scheduleDefaultsWarning={scheduleDefaultsWarning}
      onRetryScheduleDefaults={onRetryScheduleDefaults}
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
          <div className="row-between" style={{ alignItems: "baseline", gap: 12 }}>
            <div className="eyebrow">모임 장부</div>
            <LinkComponent to={OPERATIONS_HREF} className="tiny">
              운영 허브
            </LinkComponent>
          </div>
          <h1 className="h1 editorial">지금 다루는 모임</h1>
          <MeetingPhaseRail activePhase={active.phase} />
          {selectedAttention ? (
            <HostSessionAttentionSummary
              page={selectedAttention}
              maxItems={selectedAttention.items.length}
              hideEmpty
              LinkComponent={LinkComponent}
            />
          ) : null}
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
