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
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { readmatesReturnState } from "@/shared/routing/readmates-route-state";
import { MeetingPhaseRail } from "./meeting-phase-rail";
import { UpcomingBookList } from "./upcoming-book-list";

const NEW_MEETING_HREF = "/app/host/sessions/new";
const OPERATIONS_HREF = "/app/host/operations";

export type HostMeetingLedgerLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
  state?: unknown;
  "aria-label"?: string;
};

export type HostMeetingLedgerLinkComponent = ComponentType<HostMeetingLedgerLinkProps>;

function DefaultLink({ to, children, state: _state, ...props }: HostMeetingLedgerLinkProps) {
  void _state;
  return <a {...props} href={to}>{children}</a>;
}

function ignoreUpcomingAccessScope() {}
function ignoreUpcomingCreate() {}

function meetingStateLabel(state: MeetingListItem["state"]) {
  if (state === "OPEN") return "진행 중";
  if (state === "DRAFT") return "작성 중";
  if (state === "PUBLISHED") return "공개됨";
  return "종료";
}

function HostHomeAttention({
  attentionError,
  attentionCount,
  attentionPage,
  onRetryAttention,
  LinkComponent,
}: {
  attentionError: boolean;
  attentionCount: number;
  attentionPage?: HostSessionAttentionData | null;
  onRetryAttention?: () => void;
  LinkComponent: HostMeetingLedgerLinkComponent;
}) {
  if (attentionError) {
    return (
      <div className="rm-host-ledger__error rm-host-editorial-ledger__state" role="alert">
        <span>확인 필요 목록을 불러오지 못했습니다.</span>
        {onRetryAttention ? (
          <button type="button" className="btn btn-ghost" onClick={onRetryAttention}>
            다시 시도
          </button>
        ) : null}
      </div>
    );
  }

  if (!attentionPage || attentionCount <= 0) {
    return null;
  }

  return (
    <section className="rm-host-editorial-ledger__attention" aria-label="확인 필요">
      <p className="small rm-host-editorial-ledger__lede">확인 필요 {attentionCount}건</p>
      <HostSessionAttentionSummary
        page={attentionPage}
        maxItems={1}
        allHref={attentionCount > 1 ? OPERATIONS_HREF : undefined}
        LinkComponent={LinkComponent}
      />
    </section>
  );
}

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
  overviewOnly = false,
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
  overviewOnly?: boolean;
}) {
  const active = resolveViewedMeeting(items, sessionId);
  const activeItem = active
    ? items.find((item) => item.sessionId === active.sessionId) ?? null
    : null;
  const attentionCount = attentionPage?.summary.needsAttentionCount ?? 0;
  const attentionBlock = (
    <HostHomeAttention
      attentionError={attentionError}
      attentionCount={attentionCount}
      attentionPage={attentionPage}
      onRetryAttention={onRetryAttention}
      LinkComponent={LinkComponent}
    />
  );

  if (overviewOnly) {
    return (
      <main className="rm-host-editorial-ledger">
        <section className="page-header-compact">
          <div className="container rm-host-editorial-ledger__stack">
            <div className="rm-host-editorial-ledger__context">
              <p className="eyebrow rm-host-editorial-ledger__eyebrow">호스트 · 오늘</p>
              <h1 className="h1 editorial rm-host-editorial-ledger__heading">오늘</h1>
              <p className="small rm-host-editorial-ledger__lede">
                여러 모임의 확인할 일과 안전한 다음 행동을 살핍니다.
              </p>
            </div>
            {active ? (
              <section className="rm-host-editorial-ledger__next" aria-label="다음 모임">
                {activeItem ? (
                  <p className="rm-host-editorial-ledger__identity">
                    {formatDateOnlyLabel(activeItem.date)} · {meetingStateLabel(activeItem.state)}
                  </p>
                ) : null}
                <div className="rm-host-editorial-ledger__actions">
                  <LinkComponent
                    to={`/app/host/sessions/${encodeURIComponent(active.sessionId)}`}
                    state={readmatesReturnState({ href: "/app/host", label: "오늘로" })}
                    className="btn btn-primary rm-host-editorial-ledger__action"
                  >
                    지금 다루는 모임 열기
                  </LinkComponent>
                  <LinkComponent to="/app/host/sessions" className="btn btn-quiet">모임 목록</LinkComponent>
                </div>
              </section>
            ) : (
              <div className="rm-empty-state rm-meeting-ledger__empty rm-host-editorial-ledger__state">
                <h2 className="h2 editorial rm-host-editorial-ledger__state-title">아직 열린 모임이 없습니다</h2>
                <LinkComponent to={NEW_MEETING_HREF} className="btn btn-primary rm-host-editorial-ledger__action">
                  첫 모임 만들기
                </LinkComponent>
              </div>
            )}
            {attentionBlock}
          </div>
        </section>
      </main>
    );
  }

  if (!active) {
    if (sessionId) {
      return children ?? null;
    }

    return (
      <main className="rm-host-editorial-ledger">
        <section className="page-header-compact">
          <div className="container rm-host-editorial-ledger__stack">
            <div className="rm-empty-state rm-meeting-ledger__empty rm-host-editorial-ledger__state">
              <p className="eyebrow rm-host-editorial-ledger__eyebrow">모임 장부</p>
              <h1 className="h1 editorial rm-host-editorial-ledger__heading">
                아직 열린 모임이 없습니다
              </h1>
              <LinkComponent to={NEW_MEETING_HREF} className="btn btn-primary rm-host-editorial-ledger__action">
                첫 모임 만들기
              </LinkComponent>
            </div>
            {attentionBlock}
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
          <div className="row-between rm-meeting-ledger__header-row">
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
