import { useState, type CSSProperties } from "react";
import { useInRouterContext, useLocation } from "react-router-dom";
import type {
  HostDashboardResponse,
  HostNotificationSummary,
  HostSessionListPage,
  HostSessionListItem,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import { HostClubOperationsCard } from "@/features/host/ui/host-club-operations-card";
import {
  getHostDashboardChecklist,
  getHostDashboardNextOperationAction,
  getHostDashboardSessionMetrics,
  getHostDashboardSessionPhase,
  getMissingCurrentSessionMembersSummary,
  hostSessionEditHref,
} from "@/features/host/model/host-dashboard-model";
import type { HostSessionLedgerItem } from "@/features/host/model/host-session-ledger-model";
import { deriveHostPrepPace, hostPrepPaceInputFrom } from "@/features/host/model/host-prep-pace";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BookCover } from "@/shared/ui/book-cover";
import { READMATES_NAV_LABELS } from "@/shared/ui/readmates-copy";
import { readmatesReturnState as defaultReadmatesReturnState } from "@/shared/routing/readmates-route-state";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import {
  formatDateOnlyLabel,
  hostAlertStateLabel,
} from "@/shared/ui/readmates-display";
import { SessionTimingIdentity } from "@/shared/ui/session-identity";
import { HOST_DASHBOARD_LABELS, newSessionHref, quickActions, SESSION_REQUIRED_REASON } from "./dashboard/constants";
import { badgeClass, checklistBadgeClass, checklistTextColor, hostAlertMetrics, memberSessionState } from "./dashboard/dashboard-helpers";
import { HostNotificationLedger } from "./dashboard/host-notification-ledger";
import { InvitePipelineSection } from "./dashboard/invite-pipeline-section";
import { MobileHostDashboard } from "./dashboard/mobile-host-dashboard";
import { HostSessionAttentionSummary } from "./host-session-ledger";
import { QuickAction } from "./dashboard/quick-action";
import {
  ChecklistMarker,
  MissingCurrentSessionMembersAlert,
  NextActionCard,
  PublicationFeedbackSection,
  SectionHeader,
} from "./dashboard/shared-sections";
import {
  UpcomingActionMessage,
  UpcomingSessionRow,
  UpcomingStartBlockedNotice,
} from "./dashboard/upcoming-session-row";
import type { HostDashboardActions, HostDashboardLinkComponent, HostDashboardLinkProps, UpcomingActionHandlers } from "./dashboard/types";
export type { HostDashboardLinkComponent } from "./dashboard/types";
const defaultHostDashboardReturnTarget: ReadmatesReturnTarget = {
  href: "/app/host",
  label: "운영으로",
};
const EMPTY_NOTIFICATION_SUMMARY: HostNotificationSummary = {
  pending: 0,
  failed: 0,
  dead: 0,
  sentLast24h: 0,
  latestFailures: [],
};

function RouterScopedDefaultLink({ to, state: _state, children, ...props }: HostDashboardLinkProps) {
  void _state;
  const location = useLocation();

  return (
    <a {...props} href={scopedAppLinkTarget(location.pathname, to)}>
      {children}
    </a>
  );
}

function DefaultLinkComponent(props: HostDashboardLinkProps) {
  const inRouter = useInRouterContext();

  if (inRouter) {
    return <RouterScopedDefaultLink {...props} />;
  }

  const { to, state: _state, children, ...anchorProps } = props;
  void _state;

  return (
    <a {...anchorProps} href={scopedAppLinkTarget(globalThis.location.pathname, to)}>
      {children}
    </a>
  );
}


export default function HostDashboard({
  auth,
  current,
  data,
  hostSessions,
  notifications = EMPTY_NOTIFICATION_SUMMARY,
  clubOperations = null,
  recordAttention = [],
  actions,
  LinkComponent = DefaultLinkComponent,
  hostDashboardReturnTarget = defaultHostDashboardReturnTarget,
  readmatesReturnState = defaultReadmatesReturnState,
}: {
  auth?: AuthMeResponse;
  current?: CurrentSessionResponse;
  data: HostDashboardResponse;
  hostSessions: HostSessionListPage;
  notifications?: HostNotificationSummary;
  clubOperations?: HostClubOperationsSnapshot | null;
  recordAttention?: HostSessionLedgerItem[] | null;
  actions: HostDashboardActions;
  LinkComponent?: HostDashboardLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
  const hostName = auth?.displayName ?? "호스트";
  const session = current?.currentSession ?? null;
  const [appendedHostSessions, setAppendedHostSessions] = useState<null | {
    base: HostSessionListPage;
    items: HostSessionListItem[];
    nextCursor: string | null;
  }>(null);
  // Spec contract: appended page buffer must not survive a mutation-driven refetch of
  // the base list. The render-time `appendedHostSessions?.base === hostSessions`
  // reference check below is the enforcement point — TanStack Query returns a fresh
  // `data` reference whenever the underlying list changes (structuralSharing keeps the
  // reference stable only when the deep contents are identical, which is what we want
  // for a noop refetch). load-more's own setter also re-anchors `.base = hostSessions`
  // so the buffer's items are dropped on the first render after the prop reference
  // advances. Regression covered in host-dashboard.test.tsx ("drops the appended host
  // sessions buffer when the base list reference advances").
  const [hostSessionVisibilityOverrides, setHostSessionVisibilityOverrides] = useState<Record<string, SessionRecordVisibility>>({});
  const [locallyOpenedSessionId, setLocallyOpenedSessionId] = useState<string | null>(null);
  const [pendingUpcomingAction, setPendingUpcomingAction] = useState<string | null>(null);
  const [isLoadingMoreHostSessions, setIsLoadingMoreHostSessions] = useState(false);
  const [upcomingMessage, setUpcomingMessage] = useState<null | { kind: "alert" | "status"; text: string }>(null);
  const hostSessionPage =
    appendedHostSessions?.base === hostSessions
      ? {
          items: [...hostSessions.items, ...appendedHostSessions.items],
          nextCursor: appendedHostSessions.nextCursor,
        }
      : hostSessions;

  const localHostSessions = hostSessionPage.items
    .filter((item) => item.sessionId !== locallyOpenedSessionId)
    .map((item) => {
      const visibility = hostSessionVisibilityOverrides[item.sessionId];
      return visibility ? { ...item, visibility } : item;
    });
  const upcomingSessions = localHostSessions.filter((item) => item.state === "DRAFT");
  const nextHostSessionsCursor = hostSessionPage.nextCursor;
  const hasCurrentSession = session !== null || locallyOpenedSessionId !== null;
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
  const prepPace = deriveHostPrepPace(hostPrepPaceInputFrom(session, data));

  const resolveMissingMember = (membershipId: string) => {
    setResolvedMissingMemberIdsByKey((current) => {
      const next = new Set(current[missingMemberKey] ?? []);
      next.add(membershipId);
      return { ...current, [missingMemberKey]: Array.from(next) };
    });
  };

  const upcomingActionKey = (sessionId: string, action: UpcomingActionKind) => `${action}:${sessionId}`;
  const isUpcomingActionPending = (sessionId: string, action: UpcomingActionKind) =>
    pendingUpcomingAction === upcomingActionKey(sessionId, action);

  const handleUpdateUpcomingVisibility = async (sessionId: string, visibility: SessionRecordVisibility) => {
    const key = upcomingActionKey(sessionId, "visibility");
    if (pendingUpcomingAction !== null) {
      return;
    }

    setPendingUpcomingAction(key);
    setUpcomingMessage({ kind: "status", text: "처리 중" });

    try {
      await actions.updateSessionVisibility(sessionId, visibility);
      setHostSessionVisibilityOverrides((current) => ({ ...current, [sessionId]: visibility }));
      setUpcomingMessage(null);
    } catch {
      setUpcomingMessage({ kind: "alert", text: "저장하지 못했습니다" });
    } finally {
      setPendingUpcomingAction(null);
    }
  };

  const handleOpenUpcomingSession = async (sessionId: string) => {
    const key = upcomingActionKey(sessionId, "open");
    if (pendingUpcomingAction !== null || hasCurrentSession) {
      return;
    }

    setPendingUpcomingAction(key);
    setUpcomingMessage({ kind: "status", text: "처리 중" });

    try {
      await actions.openSession(sessionId);
      setLocallyOpenedSessionId(sessionId);
      setUpcomingMessage({ kind: "status", text: "현재 세션 시작됨" });
    } catch {
      setUpcomingMessage({ kind: "alert", text: "저장하지 못했습니다" });
    } finally {
      setPendingUpcomingAction(null);
    }
  };

  const handleLoadMoreHostSessions = async () => {
    if (!nextHostSessionsCursor || isLoadingMoreHostSessions) {
      return;
    }

    setIsLoadingMoreHostSessions(true);
    setUpcomingMessage(null);

    try {
      const nextPage = await actions.loadHostSessions({ limit: 50, cursor: nextHostSessionsCursor });
      setAppendedHostSessions((current) => ({
        base: hostSessions,
        items: [...(current?.base === hostSessions ? current.items : []), ...nextPage.items],
        nextCursor: nextPage.nextCursor,
      }));
    } catch {
      setUpcomingMessage({ kind: "alert", text: "예정 세션을 더 불러오지 못했습니다" });
    } finally {
      setIsLoadingMoreHostSessions(false);
    }
  };

  const upcomingActions: UpcomingActionHandlers = {
    updateVisibility: handleUpdateUpcomingVisibility,
    openSession: handleOpenUpcomingSession,
    isPending: isUpcomingActionPending,
    isBusy: pendingUpcomingAction !== null,
    canOpenSession: !hasCurrentSession,
  };

  return (
    <>
      <main className="desktop-only rm-host-dashboard-desktop">
        <section className="page-header-compact">
          <div className="container">
            <div className="row-between" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <div className="eyebrow">운영</div>
                <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
                  모임 운영
                </h1>
                <div className="small" style={{ color: "var(--text-2)" }}>
                  세션 준비, 멤버 참여, 공개 기록, 초대 흐름을 작업 순서대로 확인합니다.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rm-host-dashboard-desktop__summary">
          <div className="container">
            <SectionHeader eyebrow={HOST_DASHBOARD_LABELS.attention} title="운영 상태 요약" />
            {missingMembers ? (
                    <MissingCurrentSessionMembersAlert
                      alert={missingMembers}
                      actions={actions}
                      onResolved={resolveMissingMember}
                      LinkComponent={LinkComponent}
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
            <div style={{ marginTop: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>기록 확인 필요</div>
              <HostSessionAttentionSummary items={recordAttention} LinkComponent={LinkComponent} />
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
                    <LinkComponent to={sessionEditHref} state={sessionEditState} className="btn btn-ghost btn-sm">
                      {session ? "세션 문서 편집" : "세션 문서 만들기"}
                    </LinkComponent>
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
                        <SessionTimingIdentity sessionNumber={session.sessionNumber} date={session.date} phaseLabel="이번 세션" />
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
                          {getHostDashboardSessionMetrics(session).map(([label, value]) => (
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

                <section style={{ marginTop: "28px" }}>
                  <SectionHeader
                    eyebrow="예정 세션"
                    title="앞으로 읽을 세션"
                    action={
                      <LinkComponent to={newSessionHref} className="btn btn-ghost btn-sm">
                        세션 문서 만들기
                      </LinkComponent>
                    }
                  />
                  {upcomingSessions.length > 0 ? (
                    <>
                      {!upcomingActions.canOpenSession ? <UpcomingStartBlockedNotice /> : null}
                      <div className="surface" style={{ padding: 4 }}>
                        {upcomingSessions.map((item, index) => (
                          <UpcomingSessionRow
                            key={item.sessionId}
                            session={item}
                            actions={upcomingActions}
                            showSeparator={index > 0}
                            LinkComponent={LinkComponent}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="surface-quiet" style={{ padding: 20 }}>
                      <div className="body" style={{ fontSize: 14 }}>
                        아직 등록된 예정 세션이 없습니다.
                      </div>
                    </div>
                  )}
                  {nextHostSessionsCursor ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 12 }}
                      disabled={isLoadingMoreHostSessions}
                      onClick={() => void handleLoadMoreHostSessions()}
                    >
                      {isLoadingMoreHostSessions ? "불러오는 중" : "더 보기"}
                    </button>
                  ) : null}
                  {upcomingMessage ? <UpcomingActionMessage message={upcomingMessage} /> : null}
                </section>

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
                <NextActionCard
                  action={nextAction}
                  pace={prepPace}
                  LinkComponent={LinkComponent}
                  hostDashboardReturnTarget={hostDashboardReturnTarget}
                  readmatesReturnState={readmatesReturnState}
                />

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
                                  fallbackInitial={member.displayName}
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
                {clubOperations ? <HostClubOperationsCard snapshot={clubOperations} /> : null}
                <HostNotificationLedger notifications={notifications} LinkComponent={LinkComponent} />
                <InvitePipelineSection LinkComponent={LinkComponent} />

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
                        LinkComponent={LinkComponent}
                        hostDashboardReturnTarget={hostDashboardReturnTarget}
                        readmatesReturnState={readmatesReturnState}
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
        notifications={notifications}
        sessionEditHref={sessionEditHref}
        sessionEditState={sessionEditState}
        sessionSpecificEditHref={sessionSpecificEditHref}
        checklist={checklist}
        missingMembers={missingMembers}
        actions={actions}
        onMissingMemberResolved={resolveMissingMember}
        phase={phase}
        nextAction={nextAction}
        prepPace={prepPace}
        currentMembershipId={auth?.membershipId}
        hasCurrentSession={hasCurrentSession}
        upcomingSessions={upcomingSessions}
        recordAttention={recordAttention}
        upcomingActions={upcomingActions}
        upcomingMessage={upcomingMessage}
        hasMoreUpcomingSessions={Boolean(nextHostSessionsCursor)}
        isLoadingMoreHostSessions={isLoadingMoreHostSessions}
        onLoadMoreHostSessions={handleLoadMoreHostSessions}
        LinkComponent={LinkComponent}
        hostDashboardReturnTarget={hostDashboardReturnTarget}
        readmatesReturnState={readmatesReturnState}
      />
    </>
  );
}
