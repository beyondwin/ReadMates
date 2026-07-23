import type { HostDashboardResponse, HostNotificationSummary, HostSessionListItem } from "@/features/host/model/host-view-types";
import {
  getHostDashboardSessionMetrics,
  type HostChecklistItem,
  type HostDashboardNextOperationAction as NextOperationAction,
  type HostDashboardSessionPhase as SessionPhase,
  type MissingCurrentSessionMembersSummary as MissingCurrentSessionMembers,
} from "@/features/host/model/host-dashboard-model";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { HostPrepPace } from "@/features/host/model/host-prep-pace";
import type { HostSessionAttentionData } from "@/features/host/model/host-session-ledger-model";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { formatDateOnlyLabel, formatMobileTodayLabel, hostAlertStateLabel } from "@/shared/ui/readmates-display";
import { SessionTimingIdentity } from "@/shared/ui/session-identity";
import { HostNotificationLedger } from "./host-notification-ledger";
import { HostSessionAttentionSummary } from "../host-session-ledger";
import { InvitePipelineSection } from "./invite-pipeline-section";
import { QuickAction } from "./quick-action";
import { HOST_DASHBOARD_LABELS, newSessionHref, quickActions, SESSION_REQUIRED_REASON } from "./constants";
import { badgeClass, checklistBadgeClass, checklistTextColor, hostAlertMetrics, memberSessionState, type CurrentSession } from "./dashboard-helpers";
import {
  ChecklistMarker,
  Icon,
  MissingCurrentSessionMembersAlert,
  NextActionCard,
  PublicationFeedbackSection,
} from "./shared-sections";
import { UpcomingActionMessage, UpcomingSessionMobileCard, UpcomingStartBlockedNotice } from "./upcoming-session-row";
import type { HostDashboardActions, HostDashboardLinkComponent, UpcomingActionHandlers } from "./types";

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
  nextAction,
  prepPace,
  currentMembershipId,
  hasCurrentSession,
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
  const mobileAlerts = hostAlertMetrics(data);

  return (
    <main className="mobile-only rm-host-dashboard-mobile m-body">
      <section className="rm-host-dashboard-mobile__hero">
        <div>
          <div className="tiny mono" style={{ color: "var(--text-3)", letterSpacing: "0.1em" }}>
            {formatMobileTodayLabel()}
          </div>
          <h1 className="h2 editorial rm-host-dashboard-mobile__title">모임 운영</h1>
        </div>
        <div className="small" style={{ color: "var(--text-2)" }}>
          {hostName}님, 세션 준비, 멤버 참여, 공개 기록, 초대 흐름을 작업 순서대로 확인합니다.
        </div>
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {HOST_DASHBOARD_LABELS.attention}
        </div>
        {missingMembers ? (
          <MissingCurrentSessionMembersAlert
            alert={missingMembers}
            mobile
            actions={actions}
            onResolved={onMissingMemberResolved}
            LinkComponent={LinkComponent}
          />
        ) : null}
        <div className="m-list">
          {mobileAlerts.map((alert) => (
            <div
              key={alert.mobileLabel}
              className="m-list-row rm-host-dashboard-mobile__two-column-row rm-host-dashboard-mobile__metric"
            >
              <div style={{ minWidth: 0 }}>
                <div className="body" style={{ fontSize: "13.5px", fontWeight: 600 }}>
                  {alert.mobileLabel}
                </div>
                <div className="tiny" style={{ marginTop: 2 }}>
                  {alert.mobileHint}
                </div>
              </div>
              <div className="m-row-between">
                <div
                  className="editorial"
                  style={{
                    fontSize: 30,
                    letterSpacing: 0,
                    lineHeight: 1,
                    color: alert.value > 0 ? "var(--text)" : "var(--text-4)",
                  }}
                >
                  {alert.value}
                </div>
                <span className={badgeClass(alert.value, alert.tone)}>{hostAlertStateLabel(alert.value, hasCurrentSession)}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <HostSessionAttentionSummary page={recordAttention} LinkComponent={LinkComponent} />
        </div>
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {HOST_DASHBOARD_LABELS.nextActionSection}
        </div>
        <NextActionCard
          action={nextAction}
          pace={prepPace}
          mobile
          LinkComponent={LinkComponent}
          hostDashboardReturnTarget={hostDashboardReturnTarget}
          readmatesReturnState={readmatesReturnState}
        />
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {HOST_DASHBOARD_LABELS.upcoming}
        </div>
        <article className="m-card rm-host-dashboard-mobile__session-card">
          <div className="rm-host-dashboard-mobile__session-head">
            {session ? (
              <>
                <div className="m-row-between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <SessionTimingIdentity sessionNumber={session.sessionNumber} date={session.date} phaseLabel="이번 세션" />
                    <h2 className="h4 editorial" style={{ margin: "6px 0 2px" }}>
                      {session.bookTitle}
                    </h2>
                    <div className="tiny">
                      {formatDateOnlyLabel(session.date)} · {session.startTime}
                    </div>
                    <div className="tiny" style={{ marginTop: 6, color: "var(--text-3)" }}>
                      {phase.helper}
                    </div>
                  </div>
                  <span className={badgeClass(phase.tone === "warn" ? 1 : 0, phase.tone)}>{phase.status}</span>
                </div>
                <div className="rm-host-dashboard-mobile__session-metrics">
                  {getHostDashboardSessionMetrics(session).map(([label, value]) => (
                    <div key={label}>
                      <div className="eyebrow">{label}</div>
                      <div className="editorial" style={{ fontSize: 18, marginTop: 3, letterSpacing: 0 }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div>
                <div className="eyebrow">{HOST_DASHBOARD_LABELS.upcoming}</div>
                <h2 className="h4 editorial" style={{ margin: "6px 0 2px" }}>
                  열린 세션 없음
                </h2>
                <div className="tiny">새 세션을 등록하면 RSVP와 질문 작성이 열립니다.</div>
              </div>
            )}
          </div>
          <LinkComponent to={sessionEditHref} state={sessionEditState} className="btn btn-primary rm-host-dashboard-mobile__session-cta">
            <span>{session ? "세션 문서 편집" : "세션 문서 만들기"}</span>
            <Icon name="arrow-right" size={14} />
          </LinkComponent>
        </article>
      </section>

      <section className="m-sec">
        <div className="m-eyebrow-row">
          <span className="eyebrow">예정 세션</span>
          <LinkComponent to={newSessionHref} className="tiny">
            문서 만들기
          </LinkComponent>
        </div>
        {upcomingSessions.length > 0 ? (
          <>
            {!upcomingActions.canOpenSession ? <UpcomingStartBlockedNotice mobile /> : null}
            <div
              className="rm-host-dashboard-mobile__session-rail"
              style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(220px, 82%)", gap: 10, overflowX: "auto" }}
            >
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
            style={{ marginTop: 10 }}
            disabled={isLoadingMoreHostSessions}
            onClick={() => onLoadMoreHostSessions()}
          >
            {isLoadingMoreHostSessions ? "불러오는 중" : "더 보기"}
          </button>
        ) : null}
        {upcomingMessage ? <UpcomingActionMessage message={upcomingMessage} mobile /> : null}
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {HOST_DASHBOARD_LABELS.operationTimeline}
        </div>
        <div className="m-list">
          {checklist.map((item) => (
            <div key={item.id} className="m-list-row rm-host-dashboard-mobile__checklist-row">
              <ChecklistMarker state={item.state} label={item.statusLabel} mobile />
              <div>
                <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                  {item.when}
                </div>
                <div className="body" style={{ fontSize: "13.5px", color: checklistTextColor(item.state), marginTop: 2 }}>
                  {item.title}
                </div>
                <div className="tiny" style={{ color: "var(--text-3)", marginTop: 2 }}>
                  {item.helper}
                </div>
              </div>
              {item.action ? (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled
                  aria-label={`${item.action.label} 준비 중: ${item.action.unavailableReason}`}
                >
                  {item.action.label} 준비 중
                </button>
              ) : (
                <span className={checklistBadgeClass(item.state)}>{item.statusLabel}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {HOST_DASHBOARD_LABELS.memberStatus}
        </div>
        {!session ? (
          <div className="m-card-quiet">
            <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
              세션을 만들면 참석 현황이 표시됩니다.
            </p>
          </div>
        ) : session.attendees.length === 0 ? (
          <div className="m-card-quiet">
            <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
              참석 현황 준비 중
            </p>
          </div>
        ) : (
          <div className="m-list">
            {session.attendees.map((member) => {
              const state = memberSessionState(session, member, currentMembershipId);
              const warn = member.rsvpStatus === "NO_RESPONSE";

              return (
                <div key={member.membershipId} className="m-list-row rm-host-dashboard-mobile__member-row">
                  <AvatarChip name={member.displayName} fallbackInitial={member.displayName} label={member.displayName} size={24} />
                  <span className="body" style={{ fontSize: "13.5px" }}>
                    {member.displayName}
                  </span>
                  <span className="tiny mono" style={{ color: warn ? "var(--warn)" : "var(--text-3)" }}>
                    {state}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {HOST_DASHBOARD_LABELS.publishFeedback}
        </div>
        <PublicationFeedbackSection data={data} mobile />
      </section>

      <section className="m-sec">
        <HostNotificationLedger notifications={notifications} mobile LinkComponent={LinkComponent} />
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {HOST_DASHBOARD_LABELS.invitePipeline}
        </div>
        <InvitePipelineSection mobile LinkComponent={LinkComponent} />
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {HOST_DASHBOARD_LABELS.quickActions}
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
      </section>
    </main>
  );
}
