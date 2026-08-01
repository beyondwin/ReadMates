import type {
  HostDashboardResponse,
  HostNotificationSummary,
  HostSessionListItem,
} from "@/features/host/model/host-view-types";
import {
  getHostDashboardChecklistView,
  getHostDashboardLedgerMetrics,
  getHostDashboardPriorityItems,
  getHostDashboardSessionMetrics,
  type HostChecklistItem,
  type HostDashboardNextOperationAction as NextOperationAction,
  type HostDashboardSessionPhase as SessionPhase,
  type MissingCurrentSessionMembersSummary as MissingCurrentSessionMembers,
} from "@/features/host/model/host-dashboard-model";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { HostPrepPace } from "@/features/host/model/host-prep-pace";
import type { HostSessionAttentionData } from "@/features/host/model/host-session-ledger-model";
import { formatDateOnlyLabel, formatMobileTodayLabel } from "@/shared/ui/readmates-display";
import { SessionTimingIdentity } from "@/shared/ui/session-identity";
import { HostSessionAttentionSummary } from "../host-session-ledger";
import { HostNotificationLedger } from "./host-notification-ledger";
import { HostPrepPaceNote } from "./host-prep-pace-note";
import { QuickAction } from "./quick-action";
import { newSessionHref, quickActions, SESSION_REQUIRED_REASON } from "./constants";
import { badgeClass, type CurrentSession } from "./dashboard-helpers";
import { Icon, MissingCurrentSessionMembersAlert } from "./shared-sections";
import {
  UpcomingActionMessage,
  UpcomingSessionMobileCard,
  UpcomingStartBlockedNotice,
} from "./upcoming-session-row";
import type {
  HostDashboardActions,
  HostDashboardLinkComponent,
  UpcomingActionHandlers,
} from "./types";

function MobileChecklistRow({ item }: { item: HostChecklistItem }) {
  return (
    <li className="rm-host-mobile-flow__step">
      <span className="tiny mono">{item.when}</span>
      <span>
        <strong>{item.title}</strong>
        <small>{item.helper}</small>
      </span>
      <span className={`badge badge-${item.state === "complete" ? "ok" : item.state === "pending" ? "warn" : "default"} badge-dot`}>
        {item.statusLabel}
      </span>
    </li>
  );
}

export function MobileHostDashboard({
  hostName,
  session,
  data,
  notifications,
  sessionEditHref,
  sessionEditState,
  sessionSpecificEditHref,
  checklist,
  missingMembers,
  actions,
  onMissingMemberResolved,
  phase,
  nextAction: _nextAction,
  prepPace,
  currentMembershipId: _currentMembershipId,
  hasCurrentSession: _hasCurrentSession,
  upcomingSessions,
  recordAttention,
  upcomingActions,
  upcomingMessage,
  hasMoreUpcomingSessions,
  isLoadingMoreHostSessions,
  onLoadMoreHostSessions,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: {
  hostName: string;
  session: CurrentSession | null;
  data: HostDashboardResponse;
  notifications: HostNotificationSummary;
  sessionEditHref: string;
  sessionEditState: ReadmatesReturnState;
  sessionSpecificEditHref: string | null;
  checklist: HostChecklistItem[];
  missingMembers: MissingCurrentSessionMembers | null;
  actions: HostDashboardActions;
  onMissingMemberResolved: (membershipId: string) => void;
  phase: SessionPhase;
  nextAction: NextOperationAction;
  prepPace: HostPrepPace;
  currentMembershipId: string | null | undefined;
  hasCurrentSession: boolean;
  upcomingSessions: HostSessionListItem[];
  recordAttention: HostSessionAttentionData | null;
  upcomingActions: UpcomingActionHandlers;
  upcomingMessage: null | { kind: "alert" | "status"; text: string };
  hasMoreUpcomingSessions: boolean;
  isLoadingMoreHostSessions: boolean;
  onLoadMoreHostSessions: () => void;
  LinkComponent: HostDashboardLinkComponent;
  hostDashboardReturnTarget: ReadmatesReturnTarget;
  readmatesReturnState: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
  void _currentMembershipId;
  void _hasCurrentSession;

  const priorityItems = getHostDashboardPriorityItems({
    session,
    data,
    missingMembers,
    notifications,
    recordAttention,
  });
  const ledgerMetrics = getHostDashboardLedgerMetrics(data, recordAttention);
  const ledgerTotal = ledgerMetrics.reduce((sum, metric) => sum + metric.value, 0);
  const firstLedgerItem = ledgerMetrics.find((metric) => metric.value > 0);
  const ledgerSummary = firstLedgerItem
    ? `${firstLedgerItem.label} ${firstLedgerItem.value}건 · ${firstLedgerItem.stateLabel}`
    : "확인할 항목 없음";
  const checklistView = getHostDashboardChecklistView(checklist);
  const goingCount = session?.attendees.filter((member) => member.rsvpStatus === "GOING").length ?? 0;
  const noResponseCount = session?.attendees.filter((member) => member.rsvpStatus === "NO_RESPONSE").length ?? 0;

  return (
    <main className="mobile-only rm-host-dashboard-mobile m-body">
      <header className="rm-host-dashboard-mobile__hero">
        <div className="tiny mono">{formatMobileTodayLabel()}</div>
        <h1 className="h2 editorial rm-host-dashboard-mobile__title">모임 운영</h1>
        <p className="small">{hostName}님, 우선 행동부터 확인하세요.</p>
      </header>

      <section className="m-sec rm-host-mobile-priority" aria-labelledby="host-mobile-priority-title">
        <div className="m-eyebrow-row">
          <h2 id="host-mobile-priority-title">지금 처리할 일</h2>
          <span className="tiny">최대 3건</span>
        </div>
        <div className="rm-host-mobile-priority__state">
          <span className="badge badge-accent badge-dot">{_nextAction.loopLabel}</span>
          <span className="small">{_nextAction.loopBridge}</span>
        </div>
        <HostPrepPaceNote pace={prepPace} />
        <ol className="rm-host-mobile-priority__list">
          {priorityItems.map((item) => (
            <li key={item.id} className={`rm-host-mobile-priority__item rm-host-mobile-priority__item--${item.tone}`}>
              {item.id === "missing-members" && missingMembers ? (
                <MissingCurrentSessionMembersAlert
                  alert={missingMembers}
                  compact
                  mobile
                  actions={actions}
                  onResolved={onMissingMemberResolved}
                  LinkComponent={LinkComponent}
                />
              ) : (
                <>
                  <div>
                    <span className={`badge ${item.tone === "ok" ? "badge-ok" : item.tone === "accent" ? "badge-accent" : "badge-warn"} badge-dot`}>
                      {item.count > 0 ? `${item.count}건` : "안정"}
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.helper}</p>
                  </div>
                  {item.href && item.actionLabel ? (
                    <LinkComponent
                      to={item.href}
                      state={item.href.includes("/sessions/") ? sessionEditState : undefined}
                      className="btn btn-quiet btn-sm"
                    >
                      {item.actionLabel}
                    </LinkComponent>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="m-sec rm-host-mobile-current" aria-labelledby="host-mobile-current-title">
        <div className="m-eyebrow-row">
          <h2 id="host-mobile-current-title">현재 세션</h2>
          <span className={badgeClass(phase.tone === "warn" ? 1 : 0, phase.tone)}>{phase.status}</span>
        </div>
        <article
          className="m-card rm-host-dashboard-mobile__session-card"
          aria-label="현재 세션 요약"
        >
          <div className="rm-host-dashboard-mobile__session-head">
            {session ? (
              <>
                <SessionTimingIdentity
                  sessionNumber={session.sessionNumber}
                  date={session.date}
                />
                <h3 className="h4 editorial">{session.bookTitle}</h3>
                <p className="small">
                  {formatDateOnlyLabel(session.date)} · {session.startTime} · {session.locationLabel}
                </p>
                <dl className="rm-host-dashboard-mobile__session-metrics">
                  {getHostDashboardSessionMetrics(session).map(([label, value]) => (
                    <div key={label}>
                      <dt className="eyebrow">{label}</dt>
                      <dd className="ledger-number">{value}</dd>
                    </div>
                  ))}
                </dl>
                {noResponseCount > 0 ? (
                  <p className="small rm-host-dashboard-mobile__session-note">
                    미응답 <span className="ledger-number">{noResponseCount}</span>명
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <h3 className="h4 editorial">열린 세션 없음</h3>
                <p className="small">새 세션을 등록하면 RSVP와 질문 작성이 열립니다.</p>
              </>
            )}
          </div>
          <LinkComponent
            to={sessionEditHref}
            state={sessionEditState}
            className="btn btn-primary rm-host-dashboard-mobile__session-cta"
          >
            <span>{session ? "세션 문서 열기" : "세션 문서 만들기"}</span>
            <Icon name="arrow-right" size={14} />
          </LinkComponent>
        </article>
      </section>

      <details className="m-sec rm-host-mobile-disclosure">
        <summary>
          <span>
            <strong>확인할 운영 항목</strong>
            <small>{ledgerSummary}</small>
          </span>
          <span className="badge rm-host-mobile-disclosure__count">{ledgerTotal}건</span>
        </summary>
        <dl className="rm-host-mobile-ledger">
          {ledgerMetrics.map((metric) => (
            <div key={metric.id}>
              <dt className="tiny">{metric.label}</dt>
              <dd>
                <strong className="ledger-number">{metric.value}</strong>
                <span className="tiny">{metric.stateLabel}</span>
              </dd>
            </div>
          ))}
        </dl>
        {recordAttention === null ? (
          <p role="alert">
            기록 상태를 불러오지 못했습니다.{" "}
            <LinkComponent to="/app/host/sessions">세션 기록 열기</LinkComponent>
          </p>
        ) : (
          <>
            <HostSessionAttentionSummary page={recordAttention} LinkComponent={LinkComponent} />
            <LinkComponent to="/app/host/sessions" className="rm-host-attention__all">
              <span>세션 기록 전체 보기</span>
              <Icon name="arrow-right" size={14} />
            </LinkComponent>
          </>
        )}
      </details>

      <section className="m-sec rm-host-mobile-flow" aria-labelledby="host-mobile-flow-title">
        <div className="m-eyebrow-row">
          <h2 id="host-mobile-flow-title">예정 세션</h2>
          <LinkComponent to={newSessionHref} className="small rm-host-mobile-flow__create-link">
            세션 문서 만들기
          </LinkComponent>
        </div>
        {upcomingSessions.length > 0 ? (
          <>
            {!upcomingActions.canOpenSession ? <UpcomingStartBlockedNotice mobile /> : null}
            <div className="rm-host-dashboard-mobile__session-rail">
              {upcomingSessions.map((item) => (
                <UpcomingSessionMobileCard
                  key={item.sessionId}
                  session={item}
                  actions={upcomingActions}
                  LinkComponent={LinkComponent}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="m-card-quiet">아직 등록된 예정 세션이 없습니다.</div>
        )}
        {hasMoreUpcomingSessions ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={isLoadingMoreHostSessions}
            onClick={() => onLoadMoreHostSessions()}
          >
            {isLoadingMoreHostSessions ? "예정 세션을 더 불러오는 중" : "더 보기"}
          </button>
        ) : null}
        {upcomingMessage ? <UpcomingActionMessage message={upcomingMessage} mobile /> : null}
        <h3 className="rm-host-mobile-flow__subheading">운영 흐름</h3>
        <ol className="rm-host-mobile-flow__steps" aria-label="현재 운영 단계">
          {checklistView.highlighted.map((item) => (
            <MobileChecklistRow key={item.id} item={item} />
          ))}
        </ol>
        <details className="rm-host-mobile-flow__details">
          <summary>전체 운영 일정 {checklistView.all.length}단계</summary>
          <ol aria-label="전체 운영 일정">
            {checklistView.all.map((item) => (
              <MobileChecklistRow key={item.id} item={item} />
            ))}
          </ol>
        </details>
      </section>

      <details className="m-sec rm-host-mobile-disclosure rm-host-mobile-tools">
        <summary>
          <span>
            <strong>운영 도구</strong>
            <small>알림 · 멤버 · 초대 · AI 설정</small>
          </span>
        </summary>
        <div className="rm-host-mobile-tools__rows">
          <HostNotificationLedger notifications={notifications} mobile LinkComponent={LinkComponent} />
          <div>
            <span>
              <strong>멤버 관리</strong>
              <small>
                {session
                  ? session.attendees.length === 0
                    ? "참석 현황 준비 중"
                    : `참석 ${goingCount}명 · 미응답 ${noResponseCount}명`
                  : "현재 세션 없음"}
              </small>
            </span>
            <LinkComponent to="/app/host/members">멤버 보기</LinkComponent>
          </div>
          <div>
            <span>
              <strong>멤버 초대</strong>
              <small>초대 상태와 링크 관리</small>
            </span>
            <LinkComponent to="/app/host/invitations">초대 관리</LinkComponent>
          </div>
        </div>
        <div className="m-list rm-host-dashboard-mobile__quick-actions">
          {quickActions.map((action, index) => (
            <QuickAction
              key={action.label}
              icon={action.icon}
              label={action.label}
              href={action.target === "session-edit" ? sessionSpecificEditHref : null}
              unavailableReason={action.target === "session-edit" ? SESSION_REQUIRED_REASON : action.unavailableReason}
              disabledStatusLabel={action.target === "session-edit" ? "세션 필요" : action.statusLabel}
              index={index}
              LinkComponent={LinkComponent}
              hostDashboardReturnTarget={hostDashboardReturnTarget}
              readmatesReturnState={readmatesReturnState}
            />
          ))}
        </div>
      </details>
    </main>
  );
}
