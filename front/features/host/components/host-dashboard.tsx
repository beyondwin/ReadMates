import { Link } from "@/src/app/router-link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { hostDashboardReturnTarget, readmatesReturnState } from "@/src/app/route-continuity";
import type { CurrentSessionResponse, HostDashboardResponse } from "@/features/host/api/host-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import {
  getHostDashboardChecklist,
  getHostDashboardNextOperationAction,
  getHostDashboardPublicationFeedbackRows,
  getHostDashboardSessionMetrics,
  getHostDashboardSessionPhase,
  getMissingCurrentSessionMembersSummary,
  HOST_DASHBOARD_REMINDER_UNAVAILABLE_REASON as REMINDER_UNAVAILABLE_REASON,
  hostSessionEditHref,
  type HostChecklistItem,
  type HostChecklistState as ChecklistState,
  type HostDashboardAlertTone as HostAlertTone,
  type HostDashboardNextOperationAction as NextOperationAction,
  type HostDashboardSessionPhase as SessionPhase,
  type MissingCurrentSessionMembersSummary as MissingCurrentSessionMembers,
} from "@/features/host/model/host-dashboard-model";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BookCover } from "@/shared/ui/book-cover";
import { READMATES_NAV_LABELS } from "@/shared/ui/readmates-copy";
import { formatDateOnlyLabel, hostAlertStateLabel, nonNegativeCount, rsvpLabel } from "@/shared/ui/readmates-display";
import { SessionIdentity } from "@/shared/ui/session-identity";

const HOST_DASHBOARD_LABELS = {
  operations: "운영 원장",
  attention: "오늘의 운영 판단",
  upcoming: "세션 준비 문서",
  operationTimeline: "운영 일정",
  memberStatus: "멤버 참여",
  publishFeedback: "공개 · 피드백",
  invitePipeline: "멤버 초대 관리",
  nextAction: "다음 운영 액션",
  quickActions: "운영 액션 목록",
} as const;

const SESSION_REQUIRED_REASON = "현재 세션을 먼저 만든 뒤 사용할 수 있습니다.";
const AGGREGATE_PUBLICATION_REASON =
  "공개 대기 건수는 여러 세션을 합산한 값이라 세션 기록에서 정확한 회차를 선택해야 합니다.";
const AGGREGATE_FEEDBACK_REASON =
  "피드백 문서 대기 건수는 여러 세션을 합산한 값이라 세션 기록에서 정확한 회차를 선택해야 합니다.";

const quickActions = [
  {
    label: "질문 마감 리마인더 발송",
    target: "disabled",
    icon: "notes",
    unavailableReason: REMINDER_UNAVAILABLE_REASON,
    statusLabel: "준비 중",
  },
  {
    label: "공개 요약 편집",
    target: "aggregate-guidance",
    icon: "edit",
    unavailableReason: AGGREGATE_PUBLICATION_REASON,
    statusLabel: "회차 선택",
  },
  {
    label: "피드백 문서 등록",
    target: "aggregate-guidance",
    icon: "notes",
    unavailableReason: AGGREGATE_FEEDBACK_REASON,
    statusLabel: "회차 선택",
  },
  { label: "참석 확정 마감", target: "session-edit", icon: "check" },
] as const;

type CurrentSession = NonNullable<CurrentSessionResponse["currentSession"]>;
type QuickActionIcon = (typeof quickActions)[number]["icon"];
type MissingCurrentSessionMember = NonNullable<HostDashboardResponse["currentSessionMissingMembers"]>[number];
export type HostDashboardMissingMemberAction = "add" | "remove";

export type HostDashboardActions = {
  updateCurrentSessionParticipation: (
    membershipId: string,
    action: HostDashboardMissingMemberAction,
  ) => Promise<void>;
};

const newSessionHref = "/app/host/sessions/new";

function memberSessionState(
  session: CurrentSession,
  member: CurrentSession["attendees"][number],
  currentMembershipId: string | null | undefined,
) {
  const rsvp = rsvpLabel(member.rsvpStatus);

  if (member.rsvpStatus === "NO_RESPONSE" || member.rsvpStatus === "DECLINED") {
    return rsvp;
  }

  if (member.membershipId !== currentMembershipId) {
    return rsvp;
  }

  const progress = session.myCheckin?.readingProgress;
  if (typeof progress !== "number") {
    return rsvp;
  }

  return `${rsvp} · ${progress >= 100 ? "완독" : `${progress}%`}`;
}

function hostAlertMetrics(data: HostDashboardResponse): Array<{
  desktopLabel: string;
  mobileLabel: string;
  value: number;
  desktopHint: string;
  mobileHint: string;
  tone: HostAlertTone;
}> {
  return [
    {
      desktopLabel: "RSVP 미응답",
      mobileLabel: "RSVP 미응답",
      value: nonNegativeCount(data.rsvpPending),
      desktopHint: "모임 전날 자정까지",
      mobileHint: "응답 상태 확인",
      tone: "warn",
    },
    {
      desktopLabel: "진행률 미작성",
      mobileLabel: "진행률 미작성",
      value: nonNegativeCount(data.checkinMissing),
      desktopHint: "읽기 상태 확인",
      mobileHint: "읽기 상태 확인",
      tone: "default",
    },
    {
      desktopLabel: "공개 대기",
      mobileLabel: "공개 대기",
      value: nonNegativeCount(data.publishPending),
      desktopHint: "한줄평 · 요약 편집 필요",
      mobileHint: "요약 편집 필요",
      tone: "accent",
    },
    {
      desktopLabel: "피드백 문서 등록 대기",
      mobileLabel: "피드백 문서 등록 대기",
      value: nonNegativeCount(data.feedbackPending),
      desktopHint: "문서 업로드 확인",
      mobileHint: "문서 업로드 확인",
      tone: "warn",
    },
  ];
}

export default function HostDashboard({
  auth,
  current,
  data,
  actions,
}: {
  auth?: AuthMeResponse;
  current?: CurrentSessionResponse;
  data: HostDashboardResponse;
  actions: HostDashboardActions;
}) {
  const hostName = auth?.displayName ?? "호스트";
  const session = current?.currentSession ?? null;
  const hasCurrentSession = session !== null;
  const sessionSpecificEditHref = session ? hostSessionEditHref(session.sessionId) : null;
  const sessionEditHref = sessionSpecificEditHref ?? newSessionHref;
  const sessionEditState = readmatesReturnState(hostDashboardReturnTarget);
  const checklist = getHostDashboardChecklist(session, data);
  const missingMemberKey = (data.currentSessionMissingMembers ?? [])
    .map((member) => member.membershipId)
    .join("|");
  const [resolvedMissingMemberIdsByKey, setResolvedMissingMemberIdsByKey] = useState<Record<string, string[]>>({});
  const resolvedMissingMemberIds = new Set(resolvedMissingMemberIdsByKey[missingMemberKey] ?? []);
  const missingMembers = getMissingCurrentSessionMembersSummary(data, resolvedMissingMemberIds);
  const phase = getHostDashboardSessionPhase(session);
  const nextAction = getHostDashboardNextOperationAction(session, data, missingMembers);

  const resolveMissingMember = (membershipId: string) => {
    setResolvedMissingMemberIdsByKey((current) => {
      const next = new Set(current[missingMemberKey] ?? []);
      next.add(membershipId);
      return { ...current, [missingMemberKey]: Array.from(next) };
    });
  };

  return (
    <>
      <main className="desktop-only rm-host-dashboard-desktop">
        <section className="page-header-compact">
          <div className="container">
            <div className="row-between" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <div className="eyebrow">{HOST_DASHBOARD_LABELS.operations} · {hostName}</div>
                <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
                  운영 원장
                </h1>
                <div className="small" style={{ color: "var(--text-2)" }}>
                  세션 준비, 멤버 참여, 공개 기록, 초대 흐름을 작업 순서대로 확인합니다.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: "36px 0 20px" }}>
          <div className="container">
            <SectionHeader eyebrow={HOST_DASHBOARD_LABELS.attention} title="운영 상태 요약" />
            {missingMembers ? (
              <MissingCurrentSessionMembersAlert
                alert={missingMembers}
                actions={actions}
                onResolved={resolveMissingMember}
              />
            ) : null}
            <div className="rm-document-panel" style={{ padding: "8px 22px" }}>
              {hostAlertMetrics(data).map((alert) => (
                <div
                  key={alert.desktopLabel}
                  className="row-between"
                  style={{
                    gap: 18,
                    padding: "14px 0",
                    borderTop: alert.desktopLabel === "RSVP 미응답" ? 0 : "1px solid var(--line-soft)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="body" style={{ fontSize: "14px", fontWeight: 600 }}>
                      {alert.desktopLabel}
                    </div>
                    <div className="tiny" style={{ marginTop: 2 }}>
                      {alert.desktopHint}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    <strong className="editorial" style={{ fontSize: "20px", color: alert.value > 0 ? "var(--text)" : "var(--text-4)" }}>
                      {alert.value}
                    </strong>
                    <span className={badgeClass(alert.value, alert.tone)}>{hostAlertStateLabel(alert.value, hasCurrentSession)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "28px 0 64px" }}>
          <div className="container">
            <div className="home-grid">
              <div>
                <SectionHeader
                  eyebrow={HOST_DASHBOARD_LABELS.upcoming}
                  title={phase.title}
                  action={
                    <Link to={sessionEditHref} state={sessionEditState} className="btn btn-ghost btn-sm">
                      {session ? "세션 문서 편집" : "새 세션 만들기"}
                    </Link>
                  }
                />
                <article className="rm-document-panel" style={{ padding: "28px" }}>
                  {session ? (
                    <div className="row" style={{ alignItems: "flex-start", gap: "24px" }}>
                      <BookCover
                        title={session.bookTitle}
                        author={session.bookAuthor}
                        imageUrl={session.bookImageUrl}
                        width={96}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eyebrow">{phase.eyebrow}</div>
                        <div style={{ marginTop: "8px" }}>
                          <SessionIdentity
                            sessionNumber={session.sessionNumber}
                            state="OPEN"
                            date={session.date}
                            published={false}
                            compact
                          />
                        </div>
                        <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>
                          {session.bookTitle}
                        </h2>
                        <div className="small" style={{ marginTop: "4px" }}>
                          {formatDateOnlyLabel(session.date)} {session.startTime} · {session.locationLabel}
                        </div>
                        <div className="surface-quiet" style={{ marginTop: 14, padding: "12px 14px" }}>
                          <div className="row-between" style={{ gap: 12 }}>
                            <span className="small" style={{ color: "var(--text-2)" }}>
                              {phase.helper}
                            </span>
                            <span className={badgeClass(phase.tone === "warn" ? 1 : 0, phase.tone)}>{phase.status}</span>
                          </div>
                        </div>
                        <hr className="divider-soft" style={{ margin: "16px 0" }} />
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
                            gap: "16px",
                          }}
                        >
                          {getHostDashboardSessionMetrics(session, phase.status).map(([label, value]) => (
                            <div key={label}>
                              <div className="eyebrow">{label}</div>
                              <div className="editorial" style={{ fontSize: "20px", marginTop: "4px" }}>
                                {value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h2 className="h3 editorial" style={{ margin: 0 }}>
                        새 세션을 등록해 주세요
                      </h2>
                      <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
                        {phase.helper}
                      </p>
                    </div>
                  )}
                </article>

                <section style={{ marginTop: "36px" }}>
                  <SectionHeader eyebrow={HOST_DASHBOARD_LABELS.operationTimeline} title="운영 체크리스트 · 모임 전후" />
                  <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {checklist.map((item, index) => (
                      <li
                        key={item.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "80px 28px 1fr auto",
                          gap: "20px",
                          padding: "18px 0",
                          borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
                          alignItems: "center",
                        }}
                      >
                        <span className="mono tiny" style={{ color: "var(--text-3)" }}>
                          {item.when}
                        </span>
                        <ChecklistMarker state={item.state} label={item.statusLabel} />
                        <span className="body" style={{ fontSize: "15px", color: checklistTextColor(item.state) }}>
                          {item.title}
                          <span className="tiny" style={{ display: "block", marginTop: "3px", color: "var(--text-3)" }}>
                            {item.helper}
                          </span>
                        </span>
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
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              <aside className="stack" style={{ "--stack": "24px" } as CSSProperties}>
                <NextActionCard action={nextAction} />

                <section>
                  <div className="eyebrow" style={{ marginBottom: "10px" }}>
                    {HOST_DASHBOARD_LABELS.memberStatus} · {READMATES_NAV_LABELS.member.currentSession}
                  </div>
                  <div className="rm-reading-desk" style={{ padding: "20px" }}>
                    <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
                      {!session ? (
                        <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                          세션을 만들면 참석 현황이 표시됩니다.
                        </p>
                      ) : session.attendees.length === 0 ? (
                        <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                          참석 현황 준비 중
                        </p>
                      ) : (
                        session.attendees.map((member) => {
                          const state = memberSessionState(session, member, auth?.membershipId);
                          const warn = member.rsvpStatus === "NO_RESPONSE";

                          return (
                            <div key={member.membershipId} className="row-between">
                              <span className="row" style={{ gap: "10px" }}>
                                <AvatarChip
                                  name={member.displayName}
                                  fallbackInitial={member.shortName}
                                  label={member.displayName}
                                  size={22}
                                />
                                <span className="body" style={{ fontSize: "13.5px" }}>
                                  {member.displayName}
                                </span>
                              </span>
                              <span className="tiny mono" style={{ color: warn ? "var(--warn)" : "var(--text-3)" }}>
                                {state}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </section>

                <PublicationFeedbackSection data={data} />
                <InvitePipelineSection />

                <section>
                  <div className="eyebrow" style={{ marginBottom: "10px" }}>
                    {HOST_DASHBOARD_LABELS.quickActions}
                  </div>
                  <div className="rm-action-cluster rm-action-cluster--stacked" style={{ padding: "6px" }}>
                    {quickActions.map((action, index) => (
                      <QuickAction
                        key={action.label}
                        icon={action.icon}
                        label={action.label}
                        href={action.target === "session-edit" ? sessionSpecificEditHref : null}
                        unavailableReason={action.target === "session-edit" ? SESSION_REQUIRED_REASON : action.unavailableReason}
                        disabledStatusLabel={action.target === "session-edit" ? "세션 필요" : action.statusLabel}
                        index={index}
                      />
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </section>
      </main>
      <MobileHostDashboard
        hostName={hostName}
        session={session}
        data={data}
        sessionEditHref={sessionEditHref}
        sessionEditState={sessionEditState}
        sessionSpecificEditHref={sessionSpecificEditHref}
        checklist={checklist}
        missingMembers={missingMembers}
        actions={actions}
        onMissingMemberResolved={resolveMissingMember}
        phase={phase}
        nextAction={nextAction}
        currentMembershipId={auth?.membershipId}
      />
    </>
  );
}

function MobileHostDashboard({
  hostName,
  session,
  data,
  sessionEditHref,
  sessionEditState,
  sessionSpecificEditHref,
  checklist,
  missingMembers,
  actions,
  onMissingMemberResolved,
  phase,
  nextAction,
  currentMembershipId,
}: {
  hostName: string;
  session: CurrentSession | null;
  data: HostDashboardResponse;
  sessionEditHref: string;
  sessionEditState: ReturnType<typeof readmatesReturnState>;
  sessionSpecificEditHref: string | null;
  checklist: HostChecklistItem[];
  missingMembers: MissingCurrentSessionMembers | null;
  actions: HostDashboardActions;
  onMissingMemberResolved: (membershipId: string) => void;
  phase: SessionPhase;
  nextAction: NextOperationAction;
  currentMembershipId: string | null | undefined;
}) {
  const mobileAlerts = hostAlertMetrics(data);

  return (
    <main className="mobile-only rm-host-dashboard-mobile m-body">
      <section className="rm-host-dashboard-mobile__hero">
        <div>
          <div className="eyebrow">
            {HOST_DASHBOARD_LABELS.operations} · {hostName}
          </div>
          <h1 className="h2 editorial rm-host-dashboard-mobile__title">운영 원장</h1>
        </div>
        <div className="small" style={{ color: "var(--text-2)" }}>
          세션 준비, 멤버 참여, 공개 기록, 초대 흐름을 작업 순서대로 확인합니다.
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
                <span className={badgeClass(alert.value, alert.tone)}>{hostAlertStateLabel(alert.value, session !== null)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {HOST_DASHBOARD_LABELS.nextAction}
        </div>
        <NextActionCard action={nextAction} mobile />
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
                    <div className="eyebrow">{phase.eyebrow}</div>
                    <h2 className="h4 editorial" style={{ margin: "6px 0 2px" }}>
                      {session.bookTitle}
                    </h2>
                    <div style={{ marginTop: 6 }}>
                      <SessionIdentity
                        sessionNumber={session.sessionNumber}
                        state="OPEN"
                        date={session.date}
                        published={false}
                        compact
                      />
                    </div>
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
                  {getHostDashboardSessionMetrics(session, phase.status).map(([label, value]) => (
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
          <Link to={sessionEditHref} state={sessionEditState} className="btn btn-primary rm-host-dashboard-mobile__session-cta">
            <span>{session ? "세션 문서 편집" : "새 세션 만들기"}</span>
            <Icon name="arrow-right" size={14} />
          </Link>
        </article>
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
                  <AvatarChip name={member.displayName} fallbackInitial={member.shortName} label={member.displayName} size={24} />
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
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {HOST_DASHBOARD_LABELS.invitePipeline}
        </div>
        <InvitePipelineSection mobile />
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
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function MissingCurrentSessionMembersAlert({
  alert,
  mobile = false,
  actions,
  onResolved,
}: {
  alert: MissingCurrentSessionMembers;
  mobile?: boolean;
  actions: HostDashboardActions;
  onResolved: (membershipId: string) => void;
}) {
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<null | { kind: "alert" | "status"; text: string }>(null);
  const memberNames = alert.members.length > 0 ? alert.members.map((member) => member.displayName).join(", ") : null;
  const countLabel = `새 멤버 ${alert.count}명이 현재 세션에 아직 없습니다.`;
  const className = mobile ? "m-card" : "rm-ledger-row";
  const style = mobile
    ? ({ marginBottom: 12 } as CSSProperties)
    : ({
        padding: "20px 22px",
        marginBottom: "18px",
        color: "var(--text)",
        background: "var(--warning-soft)",
        borderColor: "var(--warning-line)",
      } as CSSProperties);
  const submitAction = async (member: MissingCurrentSessionMember, action: HostDashboardMissingMemberAction) => {
    const key = `${member.membershipId}:${action}`;
    if (pendingActions.has(key)) {
      return;
    }

    setPendingActions((current) => new Set(current).add(key));
    setMessage(null);

    try {
      await actions.updateCurrentSessionParticipation(member.membershipId, action);
      onResolved(member.membershipId);
      setMessage({
        kind: "status",
        text: action === "add" ? "이번 세션에 추가했습니다." : "다음 세션부터 참여하도록 표시했습니다.",
      });
    } catch {
      setMessage({ kind: "alert", text: "멤버 세션 상태 업데이트에 실패했습니다. 목록을 확인한 뒤 다시 시도해 주세요." });
    } finally {
      setPendingActions((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <article className={className} style={style} role="status">
      <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        <div>
          <span className="badge badge-warn badge-dot">확인 필요</span>
          <h2 className={mobile ? "h4 editorial" : "h3 editorial"} style={{ margin: "8px 0 0" }}>
            {countLabel}
          </h2>
          {memberNames ? (
            <p className="small" style={{ color: "var(--text-2)", margin: "4px 0 0" }}>
              {memberNames}
            </p>
          ) : null}
          <p className="tiny" style={{ margin: "8px 0 0", color: "var(--text-3)" }}>
            승인된 멤버 목록과 현재 세션 참석 roster를 비교한 결과입니다. 처리하면 이 알림에서 사라집니다.
          </p>
        </div>
        {message ? (
          <p
            role={message.kind}
            className="small"
            style={{ margin: 0, color: message.kind === "alert" ? "var(--danger)" : "var(--text-2)" }}
          >
            {message.text}
          </p>
        ) : null}
        {alert.members.length > 0 ? (
          <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
            {alert.members.map((member) => {
              const rowPending = pendingActions.has(`${member.membershipId}:add`) || pendingActions.has(`${member.membershipId}:remove`);

              return (
                <div
                  key={member.membershipId}
                  className="row-between"
                  style={{
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                    borderTop: "1px solid var(--line-soft)",
                    paddingTop: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="body" style={{ fontSize: mobile ? "13.5px" : "14px", fontWeight: 600 }}>
                      {member.displayName}
                    </div>
                    <div className="tiny">{member.email}</div>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={rowPending}
                      onClick={() => void submitAction(member, "add")}
                    >
                      이번 세션에 추가
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={rowPending}
                      onClick={() => void submitAction(member, "remove")}
                    >
                      다음 세션부터
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Link to="/app/host/members" className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>
            멤버 관리
          </Link>
        )}
      </div>
    </article>
  );
}

function NextActionCard({ action, mobile = false }: { action: NextOperationAction; mobile?: boolean }) {
  const body = (
    <>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {HOST_DASHBOARD_LABELS.nextAction}
      </div>
      <h2 className={mobile ? "h4 editorial" : "h3 editorial"} style={{ margin: 0 }}>
        {action.title}
      </h2>
      <p className="small" style={{ margin: "8px 0 0", color: "var(--text-2)" }}>
        {action.helper}
      </p>
      {action.label ? (
        <div style={{ marginTop: 14 }}>
          {action.href ? (
            <Link to={action.href} state={readmatesReturnState(hostDashboardReturnTarget)} className="btn btn-primary btn-sm">
              {action.label}
            </Link>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              disabled
              aria-label={`${action.label}: ${action.unavailableReason ?? action.helper}`}
            >
              {action.label}
            </button>
          )}
        </div>
      ) : null}
      {!action.href && action.unavailableReason ? (
        <p className="tiny" style={{ margin: "8px 0 0", color: "var(--text-3)" }}>
          {action.unavailableReason}
        </p>
      ) : null}
    </>
  );

  return (
    <section className={mobile ? "m-card" : "rm-document-panel"} style={{ padding: mobile ? undefined : "20px 22px" }}>
      {body}
    </section>
  );
}

function PublicationFeedbackSection({ data, mobile = false }: { data: HostDashboardResponse; mobile?: boolean }) {
  const rows = getHostDashboardPublicationFeedbackRows(data);

  return (
    <section className={mobile ? "m-list" : "rm-reading-desk"} style={{ padding: mobile ? undefined : "8px 18px" }}>
      {!mobile ? (
        <div className="eyebrow" style={{ paddingTop: 12, marginBottom: 4 }}>
          {HOST_DASHBOARD_LABELS.publishFeedback}
        </div>
      ) : null}
      {rows.map((row) => (
        <div
          key={row.label}
          className={mobile ? "m-list-row rm-host-dashboard-mobile__two-column-row rm-host-dashboard-mobile__publication-row" : "row-between"}
          style={{
            gap: 14,
            padding: mobile ? undefined : "12px 0",
            borderTop: mobile || row.label === "공개 기록" ? undefined : "1px solid var(--line-soft)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="body" style={{ fontSize: "13.5px", fontWeight: 600 }}>
              {row.label}
            </div>
            <div className="tiny" style={{ marginTop: 2 }}>
              {row.helper}
            </div>
          </div>
          <span className={badgeClass(row.tone === "ok" ? 0 : 1, row.tone)}>{row.value}</span>
        </div>
      ))}
    </section>
  );
}

function InvitePipelineSection({ mobile = false }: { mobile?: boolean }) {
  return (
    <section className={mobile ? "m-card-quiet" : "surface-quiet"} style={{ padding: mobile ? undefined : "18px" }}>
      {!mobile ? (
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          {HOST_DASHBOARD_LABELS.invitePipeline}
        </div>
      ) : null}
      <div className="body" style={{ fontSize: "13.5px", fontWeight: 600 }}>
        초대 링크 생성, 대기, 수락, 만료 상태를 초대 화면에서 관리합니다.
      </div>
      <p className="tiny" style={{ margin: "6px 0 12px", color: "var(--text-3)" }}>
        보안상 초대 URL은 생성 직후에만 복사합니다. 기존 대기 초대는 취소하거나 새 링크를 발급하세요.
      </p>
      <Link to="/app/host/invitations" className="btn btn-ghost btn-sm">
        초대 관리 열기
      </Link>
    </section>
  );
}

function QuickAction({
  icon,
  label,
  href,
  unavailableReason,
  disabledStatusLabel,
  index,
}: {
  icon: QuickActionIcon;
  label: string;
  href: string | null;
  unavailableReason: string;
  disabledStatusLabel: string;
  index: number;
}) {
  const style = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "12px 14px",
    borderRadius: "6px",
    textAlign: "left" as const,
    borderTop: index > 0 ? "1px solid var(--line-soft)" : "none",
  };

  if (href) {
    return (
      <Link to={href} state={readmatesReturnState(hostDashboardReturnTarget)} style={style}>
        <Icon name={icon} size={14} style={{ color: "var(--text-3)" }} />
        <span className="body" style={{ fontSize: "13.5px", flex: 1 }}>
          {label}
        </span>
        <Icon name="arrow-right" size={13} style={{ color: "var(--text-4)" }} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled
      aria-label={`${label} ${disabledStatusLabel}: ${unavailableReason}`}
      style={{
        ...style,
        color: "var(--text-3)",
        cursor: "not-allowed",
      }}
    >
      <Icon name={icon} size={14} style={{ color: "var(--text-4)" }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="body" style={{ display: "block", fontSize: "13.5px" }}>
          {label}
        </span>
        <span className="tiny" style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>
          {unavailableReason}
        </span>
      </span>
      <span className="badge">{disabledStatusLabel}</span>
    </button>
  );
}

function ChecklistMarker({
  state,
  label,
  mobile = false,
}: {
  state: ChecklistState;
  label: string;
  mobile?: boolean;
}) {
  const desktopStyle = mobile
    ? undefined
    : {
        width: "20px",
        height: "20px",
        borderRadius: "999px",
        background: state === "complete" ? "var(--ok)" : "transparent",
        border: `1px solid ${state === "complete" ? "var(--ok)" : "var(--line-strong)"}`,
        color: state === "complete" ? "var(--paper-50)" : "var(--text-3)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "12px",
      };
  const mobileStyle = mobile && state !== "complete" ? { color: "var(--text-3)" } : undefined;

  return (
    <span
      aria-label={label}
      className={mobile ? "rm-host-dashboard-mobile__check" : undefined}
      data-done={state === "complete" ? "true" : "false"}
      data-state={state}
      style={desktopStyle ?? mobileStyle}
    >
      {state === "complete" ? <Icon name="check" size={10} /> : state === "guidance" ? "i" : ""}
    </span>
  );
}

function checklistTextColor(state: ChecklistState) {
  return state === "complete" ? "var(--text-3)" : "var(--text)";
}

function checklistBadgeClass(state: ChecklistState) {
  if (state === "complete") {
    return "badge badge-ok badge-dot";
  }

  if (state === "pending") {
    return "badge badge-warn badge-dot";
  }

  return "badge";
}

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "16px" }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: "8px" }}>
          {eyebrow}
        </div>
        <h2 className="h2" style={{ margin: 0 }}>
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function Icon({
  name,
  size = 16,
  style,
}: {
  name: QuickActionIcon | "arrow-right";
  size?: number;
  style?: CSSProperties;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style,
  };

  switch (name) {
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M4 10h12M11 5l5 5-5 5" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M4 10.5l4 4L16 6" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 16h3l8-8-3-3-8 8v3zM12 5l3 3" />
        </svg>
      );
    case "notes":
      return (
        <svg {...common}>
          <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M12 3v3h3M7 10h6M7 13h4" />
        </svg>
      );
  }
}

function badgeClass(value: number, tone: HostAlertTone) {
  if (value === 0 || tone === "ok") {
    return "badge badge-ok badge-dot";
  }

  if (tone === "warn") {
    return "badge badge-warn badge-dot";
  }

  if (tone === "accent") {
    return "badge badge-accent badge-dot";
  }

  return "badge badge-dot";
}
