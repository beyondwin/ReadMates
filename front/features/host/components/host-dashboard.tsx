import { Link } from "@/src/app/router-link";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { AuthMeResponse, CurrentSessionResponse, HostDashboardResponse } from "@/shared/api/readmates";
import { readmatesFetchResponse } from "@/shared/api/readmates";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BookCover } from "@/shared/ui/book-cover";
import { READMATES_NAV_LABELS, READMATES_WORKSPACE_LABELS } from "@/shared/ui/readmates-copy";
import { formatDateOnlyLabel, hostAlertStateLabel, nonNegativeCount, rsvpLabel } from "@/shared/ui/readmates-display";

const HOST_DASHBOARD_LABELS = {
  operations: "운영",
  attention: "확인 필요",
  upcoming: "이번 세션",
  operationTimeline: "운영 일정",
  memberStatus: "멤버 상태",
  quickActions: "빠른 액션",
} as const;

const REMINDER_UNAVAILABLE_REASON = "리마인더 발송 기능이 아직 연결되지 않아 사용할 수 없습니다.";
const SESSION_REQUIRED_REASON = "현재 세션을 먼저 만든 뒤 사용할 수 있습니다.";

const quickActions = [
  {
    label: "질문 마감 리마인더 발송",
    target: "disabled",
    icon: "notes",
    unavailableReason: REMINDER_UNAVAILABLE_REASON,
  },
  { label: "공개 요약 편집", target: "session-edit", icon: "edit" },
  { label: "피드백 문서 등록", target: "session-edit", icon: "notes" },
  { label: "참석 확정 마감", target: "session-edit", icon: "check" },
] as const;

type CurrentSession = NonNullable<CurrentSessionResponse["currentSession"]>;
type QuickActionIcon = (typeof quickActions)[number]["icon"];
type HostAlertTone = "warn" | "default" | "accent" | "ok";
type ChecklistState = "complete" | "pending" | "guidance";
type MissingCurrentSessionMember = NonNullable<HostDashboardResponse["currentSessionMissingMembers"]>[number];
type MissingCurrentSessionMembers = {
  count: number;
  members: MissingCurrentSessionMember[];
};
type HostChecklistItem = {
  id: string;
  when: string;
  title: string;
  helper: string;
  state: ChecklistState;
  statusLabel: string;
  action?: {
    label: string;
    unavailableReason: string;
  };
};

const questionLimitPerMember = 5;
const newSessionHref = "/app/host/sessions/new";

function hostSessionEditHref(sessionId: string) {
  return `/app/host/sessions/${encodeURIComponent(sessionId)}/edit`;
}

function formatHostSessionKicker(session: CurrentSession, now = new Date()) {
  const number = String(session.sessionNumber).padStart(2, "0");
  const dday = formatDday(session.date, now);
  return dday ? `No.${number} · ${dday}` : `No.${number}`;
}

function formatDday(sessionDate: string, now: Date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return "D-day";
  }

  return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
}

function goingCount(session: CurrentSession) {
  return session.attendees.filter((attendee) => attendee.rsvpStatus === "GOING").length;
}

function sessionMetrics(session: CurrentSession, data: HostDashboardResponse) {
  const attendeeCount = session.attendees.length;
  const checkinCount = session.board.checkins.length;
  const questionCount = session.board.questions.length;
  const questionCapacity = attendeeCount * questionLimitPerMember;

  return [
    ["참석", `${goingCount(session)}/${session.attendees.length}`],
    ["체크인", `${checkinCount}/${attendeeCount}`],
    ["질문", `${questionCount}/${questionCapacity}`],
    ["공개", data.publishPending > 0 ? "대기" : "완료"],
  ];
}

function buildHostChecklist(session: CurrentSession | null, data: HostDashboardResponse): HostChecklistItem[] {
  const rsvpPending = nonNegativeCount(data.rsvpPending);
  const publishPending = nonNegativeCount(data.publishPending);
  const feedbackPending = nonNegativeCount(data.feedbackPending);
  const hasSession = session !== null;
  const hasCoreSessionInfo = Boolean(
    session?.bookTitle.trim() && session.bookAuthor.trim() && session.date && session.startTime && session.locationLabel.trim(),
  );
  const hasMeetingUrl = Boolean(session?.meetingUrl?.trim());
  const rsvpAndMeetingReady = hasSession && rsvpPending === 0 && hasMeetingUrl;
  const rsvpMeetingHelper = !hasSession
    ? "세션을 만들면 RSVP와 미팅 URL을 확인할 수 있습니다."
    : rsvpAndMeetingReady
      ? "RSVP와 미팅 URL이 준비됐습니다."
      : [rsvpPending > 0 ? `RSVP 미응답 ${rsvpPending}명` : null, hasMeetingUrl ? null : "미팅 URL 없음"]
          .filter(Boolean)
          .join(" · ");

  return [
    {
      id: "session-basics",
      when: "7일 전",
      title: "책 정보와 일정 점검",
      helper: hasSession ? "현재 세션 정보 기준으로 계산합니다." : "세션을 만들면 상태를 확인할 수 있습니다.",
      state: !hasSession ? "guidance" : hasCoreSessionInfo ? "complete" : "pending",
      statusLabel: !hasSession ? "안내" : hasCoreSessionInfo ? "완료" : "확인 필요",
    },
    {
      id: "question-guide",
      when: "3일 전",
      title: "질문 작성 안내",
      helper: "안내 발송 여부를 확인하는 기능이 아직 연결되지 않아 운영 가이드로 표시합니다.",
      state: "guidance",
      statusLabel: "안내",
    },
    {
      id: "question-reminder",
      when: "1일 전",
      title: "질문 제출 마감 리마인더",
      helper: REMINDER_UNAVAILABLE_REASON,
      state: "guidance",
      statusLabel: "안내",
      action: {
        label: "지금 발송",
        unavailableReason: REMINDER_UNAVAILABLE_REASON,
      },
    },
    {
      id: "rsvp-meeting",
      when: "당일",
      title: "참석 응답과 미팅 URL 점검",
      helper: rsvpMeetingHelper,
      state: !hasSession ? "guidance" : rsvpAndMeetingReady ? "complete" : "pending",
      statusLabel: !hasSession ? "안내" : rsvpAndMeetingReady ? "완료" : "확인 필요",
    },
    {
      id: "publication",
      when: "1일 후",
      title: "공개 요약과 하이라이트 편집",
      helper: publishPending > 0 ? `공개 대기 세션 ${publishPending}개` : "공개 대기 중인 이전 세션이 없습니다.",
      state: publishPending > 0 ? "pending" : "guidance",
      statusLabel: publishPending > 0 ? "확인 필요" : "안내",
    },
    {
      id: "feedback",
      when: "3~5일 후",
      title: "피드백 문서 등록",
      helper: feedbackPending > 0 ? `피드백 문서 등록 대기 ${feedbackPending}개` : "피드백 문서 등록 대기 중인 이전 세션이 없습니다.",
      state: feedbackPending > 0 ? "pending" : "guidance",
      statusLabel: feedbackPending > 0 ? "확인 필요" : "안내",
    },
  ];
}

function memberSessionState(session: CurrentSession, member: CurrentSession["attendees"][number]) {
  const rsvp = rsvpLabel(member.rsvpStatus);

  if (member.rsvpStatus === "NO_RESPONSE" || member.rsvpStatus === "DECLINED") {
    return rsvp;
  }

  const checkin = session.board.checkins.find(
    (item) => item.authorName === member.displayName || item.authorShortName === member.shortName,
  );
  const progress = checkin?.readingProgress;
  const progressLabel = typeof progress === "number" ? (progress >= 100 ? "완독" : `${progress}%`) : "대기";

  return `${rsvp} · ${progressLabel}`;
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
      desktopLabel: "체크인 미작성",
      mobileLabel: "체크인 미작성",
      value: nonNegativeCount(data.checkinMissing),
      desktopHint: "작성 현황 확인",
      mobileHint: "작성 현황 확인",
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

function missingCurrentSessionMembers(
  data: HostDashboardResponse,
  resolvedMemberIds: Set<string>,
): MissingCurrentSessionMembers | null {
  const members = (data.currentSessionMissingMembers ?? []).filter(
    (member) => !resolvedMemberIds.has(member.membershipId),
  );
  const count = data.currentSessionMissingMembers ? members.length : Math.max(0, (data.currentSessionMissingMemberCount ?? 0) - resolvedMemberIds.size);

  if (count <= 0) {
    return null;
  }

  return {
    count,
    members,
  };
}

export default function HostDashboard({
  auth,
  current,
  data,
}: {
  auth?: AuthMeResponse;
  current?: CurrentSessionResponse;
  data: HostDashboardResponse;
}) {
  const hostName = auth?.displayName ?? "호스트";
  const session = current?.currentSession ?? null;
  const hasCurrentSession = session !== null;
  const sessionSpecificEditHref = session ? hostSessionEditHref(session.sessionId) : null;
  const sessionEditHref = sessionSpecificEditHref ?? newSessionHref;
  const checklist = buildHostChecklist(session, data);
  const missingMemberKey = (data.currentSessionMissingMembers ?? [])
    .map((member) => member.membershipId)
    .join("|");
  const [resolvedMissingMemberIdsByKey, setResolvedMissingMemberIdsByKey] = useState<Record<string, string[]>>({});
  const resolvedMissingMemberIds = new Set(resolvedMissingMemberIdsByKey[missingMemberKey] ?? []);
  const missingMembers = missingCurrentSessionMembers(data, resolvedMissingMemberIds);

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
                <div className="eyebrow">
                  {HOST_DASHBOARD_LABELS.operations} · {hostName}
                </div>
                <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
                  운영 대시보드
                </h1>
                <div className="small" style={{ color: "var(--text-2)" }}>
                  멤버 워크스페이스와 같은 세계, 운영 권한이 확장된 화면.
                </div>
              </div>
              <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
                <Link to="/app" className="btn btn-ghost">
                  {READMATES_WORKSPACE_LABELS.memberWorkspaceReturn}
                </Link>
                <Link to="/app/host/invitations" className="btn btn-ghost">
                  {READMATES_NAV_LABELS.host.invitations}
                </Link>
                <Link to="/app/host/sessions/new" className="btn btn-primary">
                  + 새 세션
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: "36px 0 20px" }}>
          <div className="container">
            <div className="eyebrow" style={{ marginBottom: "14px" }}>
              {HOST_DASHBOARD_LABELS.attention}
            </div>
            {missingMembers ? <MissingCurrentSessionMembersAlert alert={missingMembers} onResolved={resolveMissingMember} /> : null}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "20px",
              }}
            >
              {hostAlertMetrics(data).map((alert) => (
                <article key={alert.desktopLabel} className="surface" style={{ padding: "22px" }}>
                  <div className="row-between">
                    <div
                      className="editorial"
                      style={{
                        fontSize: "36px",
                        letterSpacing: "-0.03em",
                        color: alert.value > 0 ? "var(--text)" : "var(--text-4)",
                      }}
                    >
                      {alert.value}
                    </div>
                    <span className={badgeClass(alert.value, alert.tone)}>
                      {hostAlertStateLabel(alert.value, hasCurrentSession)}
                    </span>
                  </div>
                  <div className="body" style={{ fontSize: "14px", fontWeight: 500, marginTop: "10px" }}>
                    {alert.desktopLabel}
                  </div>
                  <div className="tiny" style={{ marginTop: "4px" }}>
                    {alert.desktopHint}
                  </div>
                </article>
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
                  title={session ? "진행 중인 세션" : "열린 세션 없음"}
                  action={
                    <Link to={sessionEditHref} className="btn btn-ghost btn-sm">
                      {session ? "확인" : "새 세션 만들기"}
                    </Link>
                  }
                />
                <article className="surface" style={{ padding: "28px" }}>
                  {session ? (
                    <div className="row" style={{ alignItems: "flex-start", gap: "24px" }}>
                      <BookCover
                        title={session.bookTitle}
                        author={session.bookAuthor}
                        imageUrl={session.bookImageUrl}
                        width={96}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eyebrow">{formatHostSessionKicker(session)}</div>
                        <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>
                          {session.bookTitle}
                        </h2>
                        <div className="small" style={{ marginTop: "4px" }}>
                          {formatDateOnlyLabel(session.date)} {session.startTime} · {session.locationLabel}
                        </div>
                        <hr className="divider-soft" style={{ margin: "16px 0" }} />
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
                            gap: "16px",
                          }}
                        >
                          {sessionMetrics(session, data).map(([label, value]) => (
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
                        등록 후 멤버 홈과 현재 세션 화면에 RSVP와 질문 작성이 열립니다.
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
                <section>
                  <div className="eyebrow" style={{ marginBottom: "10px" }}>
                    {HOST_DASHBOARD_LABELS.memberStatus} · {READMATES_NAV_LABELS.member.currentSession}
                  </div>
                  <div className="surface" style={{ padding: "20px" }}>
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
                          const state = memberSessionState(session, member);
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

                <section>
                  <div className="eyebrow" style={{ marginBottom: "10px" }}>
                    {HOST_DASHBOARD_LABELS.quickActions}
                  </div>
                  <div className="surface" style={{ padding: "6px" }}>
                    {quickActions.map((action, index) => (
                      <QuickAction
                        key={action.label}
                        icon={action.icon}
                        label={action.label}
                        href={action.target === "session-edit" ? sessionSpecificEditHref : null}
                        unavailableReason={action.target === "session-edit" ? SESSION_REQUIRED_REASON : action.unavailableReason}
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
        sessionSpecificEditHref={sessionSpecificEditHref}
        checklist={checklist}
        missingMembers={missingMembers}
        onMissingMemberResolved={resolveMissingMember}
      />
    </>
  );
}

function MobileHostDashboard({
  hostName,
  session,
  data,
  sessionEditHref,
  sessionSpecificEditHref,
  checklist,
  missingMembers,
  onMissingMemberResolved,
}: {
  hostName: string;
  session: CurrentSession | null;
  data: HostDashboardResponse;
  sessionEditHref: string;
  sessionSpecificEditHref: string | null;
  checklist: HostChecklistItem[];
  missingMembers: MissingCurrentSessionMembers | null;
  onMissingMemberResolved: (membershipId: string) => void;
}) {
  const mobileAlerts = hostAlertMetrics(data);

  return (
    <main className="mobile-only rm-host-dashboard-mobile m-body">
      <section className="rm-host-dashboard-mobile__hero">
        <div className="m-row-between" style={{ alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="eyebrow">
              {HOST_DASHBOARD_LABELS.operations} · {hostName}
            </div>
            <h1 className="h2 editorial rm-host-dashboard-mobile__title">운영 대시보드</h1>
          </div>
          <Link to="/app" className="btn btn-ghost btn-sm">
            {READMATES_WORKSPACE_LABELS.memberWorkspaceReturn}
          </Link>
        </div>
        <div className="small" style={{ color: "var(--text-2)" }}>
          오늘의 할 일과 다음 모임을 한눈에.
        </div>
      </section>

      <section className="m-sec">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {HOST_DASHBOARD_LABELS.attention}
        </div>
        {missingMembers ? (
          <MissingCurrentSessionMembersAlert alert={missingMembers} mobile onResolved={onMissingMemberResolved} />
        ) : null}
        <div className="m-stat-grid">
          {mobileAlerts.map((alert) => (
            <article key={alert.mobileLabel} className="m-card rm-host-dashboard-mobile__metric">
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
              <div className="body" style={{ fontSize: "13.5px", fontWeight: 500, marginTop: 8 }}>
                {alert.mobileLabel}
              </div>
              <div className="tiny" style={{ marginTop: 2 }}>
                {alert.mobileHint}
              </div>
            </article>
          ))}
        </div>
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
                    <div className="eyebrow">{formatHostSessionKicker(session)}</div>
                    <h2 className="h4 editorial" style={{ margin: "6px 0 2px" }}>
                      {session.bookTitle}
                    </h2>
                    <div className="tiny">
                      {formatDateOnlyLabel(session.date)} · {session.startTime}
                    </div>
                  </div>
                  <span className="badge badge-accent badge-dot">{formatDday(session.date, new Date()) ?? `No.${session.sessionNumber}`}</span>
                </div>
                <div className="rm-host-dashboard-mobile__session-metrics">
                  {sessionMetrics(session, data).map(([label, value]) => (
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
          <Link to={sessionEditHref} className="btn btn-primary rm-host-dashboard-mobile__session-cta">
            <span>{READMATES_NAV_LABELS.host.sessionEditor}</span>
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
              const state = memberSessionState(session, member);
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
  onResolved,
}: {
  alert: MissingCurrentSessionMembers;
  mobile?: boolean;
  onResolved: (membershipId: string) => void;
}) {
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<null | { kind: "alert" | "status"; text: string }>(null);
  const memberNames = alert.members.length > 0 ? alert.members.map((member) => member.displayName).join(", ") : null;
  const countLabel = `새 멤버 ${alert.count}명이 현재 세션에 아직 없습니다.`;
  const className = mobile ? "m-card" : "surface";
  const style = mobile
    ? ({ marginBottom: 12 } as CSSProperties)
    : ({ padding: "20px 22px", marginBottom: "18px", borderColor: "var(--warn)" } as CSSProperties);
  const actionPath = {
    add: "/current-session/add",
    remove: "/current-session/remove",
  } as const;

  const submitAction = async (member: MissingCurrentSessionMember, action: keyof typeof actionPath) => {
    const key = `${member.membershipId}:${action}`;
    if (pendingActions.has(key)) {
      return;
    }

    setPendingActions((current) => new Set(current).add(key));
    setMessage(null);

    try {
      const response = await readmatesFetchResponse(
        `/api/host/members/${encodeURIComponent(member.membershipId)}${actionPath[action]}`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error("Current session member action failed");
      }

      onResolved(member.membershipId);
      setMessage({
        kind: "status",
        text: action === "add" ? "이번 세션에 추가했습니다." : "다음 세션부터 참여하도록 표시했습니다.",
      });
    } catch {
      setMessage({ kind: "alert", text: "멤버 세션 상태 업데이트에 실패했습니다." });
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

function QuickAction({
  icon,
  label,
  href,
  unavailableReason,
  index,
}: {
  icon: QuickActionIcon;
  label: string;
  href: string | null;
  unavailableReason: string;
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
      <Link to={href} style={style}>
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
      aria-label={`${label} 준비 중: ${unavailableReason}`}
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
      <span className="badge">준비 중</span>
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
