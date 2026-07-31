import { useState } from "react";
import { useInRouterContext, useLocation } from "react-router-dom";
import type {
  CurrentSessionResponse,
  HostDashboardResponse,
  HostNotificationSummary,
  HostSessionListPage,
  HostSessionListItem,
  HostSessionVisibilityRequest,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import { HostClubOperationsCard } from "@/features/host/ui/host-club-operations-card";
import {
  getHostDashboardChecklist,
  getHostDashboardChecklistView,
  getHostDashboardLedgerMetrics,
  getHostDashboardNextOperationAction,
  getHostDashboardPriorityItems,
  getHostDashboardSessionMetrics,
  getHostDashboardSessionPhase,
  getMissingCurrentSessionMembersSummary,
  hostSessionEditHref,
} from "@/features/host/model/host-dashboard-model";
import type { HostSessionAttentionData } from "@/features/host/model/host-session-ledger-model";
import { deriveHostPrepPace, hostPrepPaceInputFrom } from "@/features/host/model/host-prep-pace";
import { BookCover } from "@/shared/ui/book-cover";
import { readmatesReturnState as defaultReadmatesReturnState } from "@/shared/routing/readmates-route-state";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { SessionTimingIdentity } from "@/shared/ui/session-identity";
import { newSessionHref, quickActions, SESSION_REQUIRED_REASON } from "./dashboard/constants";
import { badgeClass } from "./dashboard/dashboard-helpers";
import { HostNotificationLedger } from "./dashboard/host-notification-ledger";
import { HostPrepPaceNote } from "./dashboard/host-prep-pace-note";
import { MobileHostDashboard } from "./dashboard/mobile-host-dashboard";
import {
  HostOperationFlow,
  HostOperationsTools,
  HostPriorityLedger,
  HostTodayBoard,
} from "./dashboard/priority-ledger-sections";
import { HostSessionAttentionSummary } from "./host-session-ledger";
import { QuickAction } from "./dashboard/quick-action";
import { MissingCurrentSessionMembersAlert } from "./dashboard/shared-sections";
import {
  UpcomingActionMessage,
  UpcomingSessionRow,
  UpcomingStartBlockedNotice,
} from "./dashboard/upcoming-session-row";
import type {
  HostDashboardActions,
  HostDashboardLinkComponent,
  HostDashboardLinkProps,
  UpcomingActionHandlers,
  UpcomingActionKind,
} from "./dashboard/types";
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
const EMPTY_RECORD_ATTENTION: HostSessionAttentionData = {
  items: [],
  summary: {
    needsAttentionCount: 0,
    incompletePublishedCount: 0,
    draftCount: 0,
  },
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
  recordAttention = EMPTY_RECORD_ATTENTION,
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
  recordAttention?: HostSessionAttentionData | null;
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
  const priorityItems = getHostDashboardPriorityItems({
    session,
    data,
    missingMembers,
    notifications,
    recordAttention,
  });
  const ledgerMetrics = getHostDashboardLedgerMetrics(data, recordAttention);
  const checklistView = getHostDashboardChecklistView(checklist);
  const goingCount = session?.attendees.filter((member) => member.rsvpStatus === "GOING").length ?? 0;
  const noResponseCount = session?.attendees.filter((member) => member.rsvpStatus === "NO_RESPONSE").length ?? 0;

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

  const saveUpcomingVisibility = async (
    sessionId: string,
    request: HostSessionVisibilityRequest,
  ) => {
    const key = upcomingActionKey(sessionId, "visibility");
    if (pendingUpcomingAction !== null) {
      return;
    }

    setPendingUpcomingAction(key);
    setUpcomingMessage({ kind: "status", text: "공개 범위를 저장하는 중" });

    try {
      await actions.updateSessionVisibility(sessionId, request);
      setHostSessionVisibilityOverrides((current) => ({
        ...current,
        [sessionId]: request.visibility,
      }));
      setUpcomingMessage(null);
    } catch {
      setUpcomingMessage({
        kind: "alert",
        text: "공개 범위를 저장하지 못했습니다. 기존 공개 범위는 유지됩니다. 다시 시도해 주세요.",
      });
    } finally {
      setPendingUpcomingAction(null);
    }
  };

  const handleUpdateUpcomingVisibility = async (sessionId: string, visibility: SessionRecordVisibility) => {
    await saveUpcomingVisibility(sessionId, { visibility });
  };

  const handleOpenUpcomingSession = async (sessionId: string) => {
    const key = upcomingActionKey(sessionId, "open");
    if (pendingUpcomingAction !== null || hasCurrentSession) {
      return;
    }

    setPendingUpcomingAction(key);
    setUpcomingMessage({ kind: "status", text: "세션을 시작하는 중" });

    try {
      await actions.openSession(sessionId);
      setLocallyOpenedSessionId(sessionId);
      setUpcomingMessage({ kind: "status", text: "현재 세션을 시작했습니다." });
    } catch {
      setUpcomingMessage({
        kind: "alert",
        text: "세션을 시작하지 못했습니다. 기존 세션 상태는 유지됩니다. 다시 시도해 주세요.",
      });
    } finally {
      setPendingUpcomingAction(null);
    }
  };

  const handleLoadMoreHostSessions = async () => {
    if (!nextHostSessionsCursor || isLoadingMoreHostSessions) {
      return;
    }

    setIsLoadingMoreHostSessions(true);
    setUpcomingMessage({ kind: "status", text: "예정 세션을 더 불러오는 중" });

    try {
      const nextPage = await actions.loadHostSessions({ limit: 50, cursor: nextHostSessionsCursor });
      setAppendedHostSessions((current) => ({
        base: hostSessions,
        items: [...(current?.base === hostSessions ? current.items : []), ...nextPage.items],
        nextCursor: nextPage.nextCursor,
      }));
      setUpcomingMessage(null);
    } catch {
      setUpcomingMessage({
        kind: "alert",
        text: "예정 세션을 더 불러오지 못했습니다. 기존 목록은 유지됩니다.",
      });
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
        <header className="page-header-compact">
          <div className="container rm-host-dashboard-header">
            <div className="eyebrow">호스트 원장</div>
            <h1 className="h1 editorial">모임 운영</h1>
            <p className="small">
              {hostName}님, 지금 처리할 일부터 확인하고 세션과 기록을 이어서 관리하세요.
            </p>
          </div>
        </header>

        <div className="container rm-host-dashboard-ledger">
          <HostTodayBoard
            mobile={false}
            currentSession={(
              <article className="rm-host-current" aria-labelledby="host-current-session-title">
                <header className="rm-host-current__header">
                  <div>
                    <div className="eyebrow">현재 세션</div>
                    <h2 id="host-current-session-title">현재 세션</h2>
                  </div>
                  <span className={badgeClass(phase.tone === "warn" ? 1 : 0, phase.tone)}>
                    {phase.status}
                  </span>
                </header>
                {session ? (
                  <div className="rm-host-current__body">
                    <BookCover
                      title={session.bookTitle}
                      author={session.bookAuthor}
                      imageUrl={session.bookImageUrl}
                      width={76}
                    />
                    <div className="rm-host-current__copy">
                      <SessionTimingIdentity
                        sessionNumber={session.sessionNumber}
                        date={session.date}
                        phaseLabel="이번 세션"
                      />
                      <h3 className="editorial">{session.bookTitle}</h3>
                      <p>
                        {formatDateOnlyLabel(session.date)} {session.startTime} · {session.locationLabel}
                      </p>
                      <dl className="rm-host-current__metrics">
                        {getHostDashboardSessionMetrics(session).map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd className="ledger-number">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>
                ) : (
                  <div className="rm-host-current__empty">
                    <h3>열린 세션이 없습니다</h3>
                    <p>{phase.helper}</p>
                  </div>
                )}
                <div className="rm-host-current__footer">
                  <span>
                    {session
                      ? `참석 ${goingCount}명 · 미응답 ${noResponseCount}명`
                      : "새 세션을 만들면 RSVP와 질문 작성이 열립니다."}
                  </span>
                  <LinkComponent
                    to={sessionEditHref}
                    state={sessionEditState}
                    className="btn btn-primary btn-sm"
                  >
                    {session ? "세션 문서 편집" : "세션 문서 만들기"}
                  </LinkComponent>
                </div>
              </article>
            )}
            priorityBoard={(
              <section className="rm-host-priority" aria-labelledby="host-priority-title">
                <header className="rm-host-priority__header">
                  <div>
                    <div className="eyebrow">우선순위</div>
                    <h2 id="host-priority-title">지금 처리할 일</h2>
                  </div>
                  <div className="rm-host-priority__meta">
                    <span className="tiny">최대 3건</span>
                    <span className="badge badge-accent badge-dot">{nextAction.loopLabel}</span>
                    <HostPrepPaceNote pace={prepPace} />
                  </div>
                </header>
                <p className="rm-host-priority__bridge">{nextAction.loopBridge}</p>
                <ol className="rm-host-priority__list">
                  {priorityItems.map((item) => (
                    <li key={item.id} className={`rm-host-priority__item rm-host-priority__item--${item.tone}`}>
                      {item.id === "missing-members" && missingMembers ? (
                        <MissingCurrentSessionMembersAlert
                          alert={missingMembers}
                          compact
                          actions={actions}
                          onResolved={resolveMissingMember}
                          LinkComponent={LinkComponent}
                        />
                      ) : (
                        <>
                          <div className="rm-host-priority__copy">
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
            )}
          />

          <HostPriorityLedger
            metrics={ledgerMetrics}
            recordRows={
              recordAttention ? (
                <HostSessionAttentionSummary page={recordAttention} LinkComponent={LinkComponent} />
              ) : null
            }
            recordError={recordAttention === null}
            LinkComponent={LinkComponent}
          />

          <HostOperationFlow
            upcomingSessions={(
              <section className="rm-host-upcoming" aria-label="예정 세션">
                <div className="rm-host-upcoming__header">
                  <h3>앞으로 읽을 세션</h3>
                  <LinkComponent to={newSessionHref} className="btn btn-quiet btn-sm">
                    세션 문서 만들기
                  </LinkComponent>
                </div>
                {upcomingSessions.length > 0 ? (
                  <>
                    {!upcomingActions.canOpenSession ? <UpcomingStartBlockedNotice /> : null}
                    <div className="rm-host-upcoming__list">
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
                  <p className="small">아직 등록된 예정 세션이 없습니다.</p>
                )}
                {nextHostSessionsCursor ? (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={isLoadingMoreHostSessions}
                    onClick={() => void handleLoadMoreHostSessions()}
                  >
                    {isLoadingMoreHostSessions ? "예정 세션을 더 불러오는 중" : "더 보기"}
                  </button>
                ) : null}
                {upcomingMessage ? <UpcomingActionMessage message={upcomingMessage} /> : null}
              </section>
            )}
            checklist={checklistView}
          />

          <HostOperationsTools
            notifications={(
              <HostNotificationLedger notifications={notifications} LinkComponent={LinkComponent} />
            )}
            members={(
              <div className="rm-host-tool">
                <div>
                  <h3>멤버 관리</h3>
                  <p>
                    {session
                      ? session.attendees.length === 0
                        ? "참석 현황 준비 중"
                        : `현재 세션 참석 ${goingCount}명 · 미응답 ${noResponseCount}명`
                      : "현재 세션을 만들면 참여 현황이 연결됩니다."}
                  </p>
                </div>
                <LinkComponent to="/app/host/members" className="btn btn-quiet btn-sm">
                  멤버 보기
                </LinkComponent>
              </div>
            )}
            invitations={(
              <div className="rm-host-tool">
                <div>
                  <h3>멤버 초대</h3>
                  <p>초대 링크와 대기·수락·만료 상태를 관리합니다.</p>
                </div>
                <LinkComponent to="/app/host/invitations" className="btn btn-quiet btn-sm">
                  초대 관리
                </LinkComponent>
              </div>
            )}
            quickActions={(
              <div className="rm-host-tool rm-host-tool--actions">
                <div>
                  <h3>빠른 실행</h3>
                  <p>회차가 필요한 작업은 세션 기록에서 정확한 대상을 선택합니다.</p>
                </div>
                <div className="rm-host-tool__actions">
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
              </div>
            )}
          />

          {clubOperations ? (
            <div className="rm-host-dashboard-ledger__operations-signal">
              <HostClubOperationsCard snapshot={clubOperations} LinkComponent={LinkComponent} />
            </div>
          ) : null}
        </div>
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
