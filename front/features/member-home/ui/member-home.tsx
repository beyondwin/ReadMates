import { useState, type CSSProperties, type ReactNode } from "react";
import {
  MemberHomeNextActionPace,
  MobileCurrentSessionCard,
  MobileIcon,
  type MobileIconName,
  MobileTodayActions,
} from "@/features/member-home/ui/member-home-current-session";
import { Link, PlainMemberHomeLink, type MemberHomeLinkComponent } from "@/features/member-home/ui/member-home-link";
import {
  ClubPulse,
  MobileMemberActivity,
  MobileRecentRecordEntry,
  RecentRecordEntry,
  RosterSummary,
} from "@/features/member-home/ui/member-home-records";
import { PrepCard } from "@/features/member-home/ui/prep-card";
import {
  getMemberHomeNextReadingAction,
  getMemberHomeRecentRecordEntry,
} from "@/features/member-home/model/member-home-view-model";
import type {
  MemberHomeReadView,
  MemberHomeRetryHandlers,
  MemberHomeWidgetErrors,
} from "@/features/member-home/model/member-home-read-view";
import type { CurrentSessionReadPageData } from "@/shared/model/current-session-read-view";
import type { NoteFeedItem } from "@/shared/model/notes-feed-model";
import { formatMobileTodayLabel, rsvpLabel } from "@/shared/ui/readmates-display";
import { SessionTimingIdentity } from "@/shared/ui/session-identity";

const quickLinks = [
  { label: "피드백 문서", sub: "회차 피드백", href: "/app/archive?view=report", icon: "notes" },
  { label: "안내문", sub: "모임 가이드", href: "/about", icon: "sparkle" },
] satisfies Array<{
  label: string;
  sub: string;
  href: string;
  icon: MobileIconName;
}>;

export default function MemberHome({
  view,
  LinkComponent = PlainMemberHomeLink,
  widgetErrors,
  onRetry,
}: {
  view: MemberHomeReadView;
  LinkComponent?: MemberHomeLinkComponent;
  widgetErrors?: MemberHomeWidgetErrors;
  onRetry?: MemberHomeRetryHandlers;
}) {
  const { displayName, isHost, current, noteFeedItems, upcomingSessions, capabilities } = view;
  const currentSession = current.currentSession;
  const memberName = displayName ?? "게스트";
  const canWrite = capabilities.canWrite;
  const isViewer = capabilities.canViewPersonalState && !canWrite;
  const feedbackStates = capabilities.canReadFeedback
    ? undefined
    : new Map(noteFeedItems.map((item) => [item.sessionId, "LOCKED" as const]));
  const recentRecordEntry = getMemberHomeRecentRecordEntry(noteFeedItems, { feedbackStates });

  return (
    <main>
      <div className="desktop-only rm-member-home-desktop">
        <section className="page-header-compact">
          <div className="container">
            <div className="row-between" style={{ alignItems: "flex-start", marginBottom: "28px" }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>
                  읽는사이 · 홈
                </p>
                <h1 className="h1 editorial" style={{ margin: "8px 0 0" }}>
                  {memberName}님,{" "}
                  {currentSession ? (
                    <>
                      이번 달은 <span style={{ color: "var(--accent)" }}>{currentSession.bookTitle}</span>을 함께 읽어요.
                    </>
                  ) : (
                    "다음 세션을 기다리고 있어요."
                  )}
                </h1>
                <p className="body" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
                  {currentSession
                    ? `${currentSession.bookTitle} 준비 보드가 열려 있습니다. 질문은 최대 5개까지 남길 수 있어요.`
                    : "호스트가 새 세션을 등록하면 준비 보드가 열립니다."}
                </p>
              </div>
            </div>

            {isViewer ? <ViewerMemberHomeNotice /> : null}

            <HomeAnswerStrip
              session={currentSession}
              noteFeedItems={noteFeedItems}
              isViewer={isViewer}
              canWrite={canWrite}
            />

            <section aria-label="이번 세션">
              {widgetErrors?.current ? (
                <MemberHomeWidgetFailure error={widgetErrors.current} onRetry={onRetry?.current} />
              ) : (
                <PrepCard
                  session={currentSession}
                  isHost={isHost}
                  isViewer={isViewer}
                  canWrite={canWrite}
                  canViewPersonalState={capabilities.canViewPersonalState}
                  LinkComponent={LinkComponent}
                />
              )}
            </section>
          </div>
        </section>

        <section style={{ padding: "40px 0" }}>
          <div className="container">
            <div className="home-grid">
              <div className="stack" style={{ "--stack": "40px" } as CSSProperties}>
                <section aria-label="최근 기록">
                  {widgetErrors?.recentNotes ? (
                    <MemberHomeWidgetFailure error={widgetErrors.recentNotes} onRetry={onRetry?.recentNotes} />
                  ) : (
                    <>
                      <RecentRecordEntry entry={recentRecordEntry} LinkComponent={LinkComponent} />
                      <ClubPulse items={noteFeedItems.slice(0, 3)} LinkComponent={LinkComponent} />
                    </>
                  )}
                </section>
              </div>
              <div className="stack" style={{ "--stack": "24px" } as CSSProperties}>
                <RosterSummary current={current} />
                <section aria-label="예정 세션">
                  {widgetErrors?.upcoming ? (
                    <MemberHomeWidgetFailure error={widgetErrors.upcoming} onRetry={onRetry?.upcoming} />
                  ) : (
                    <NextBookHint upcomingSessions={upcomingSessions} />
                  )}
                </section>
                <QuickLinks LinkComponent={LinkComponent} />
              </div>
            </div>
          </div>
        </section>
      </div>

      <MobileMemberHome
        current={current}
        noteFeedItems={noteFeedItems}
        upcomingSessions={upcomingSessions}
        memberName={memberName}
        isHost={isHost}
        isViewer={isViewer}
        canWrite={canWrite}
        canViewPersonalState={capabilities.canViewPersonalState}
        LinkComponent={LinkComponent}
        widgetErrors={widgetErrors}
        onRetry={onRetry}
      />
    </main>
  );
}

function HomeAnswerStrip({
  session,
  noteFeedItems,
  isViewer,
  canWrite,
}: {
  session: CurrentSessionReadPageData["currentSession"];
  noteFeedItems: NoteFeedItem[];
  isViewer: boolean;
  canWrite: boolean;
}) {
  const preservedCount = noteFeedItems.length;
  const preservedKinds = new Set(noteFeedItems.map((item) => item.kind)).size;
  const nextAction = getMemberHomeNextReadingAction({
    session,
    isViewer,
    canWrite,
    noteFeedItems,
  });

  return (
    <section className="rm-home-answer-strip" aria-label="홈 요약">
      <div className="surface-quiet rm-home-answer-strip__item">
        <div className="eyebrow">지금 읽는 책</div>
        <div className="body-lg editorial" style={{ marginTop: "8px" }}>
          {session ? session.bookTitle : "다음 책을 기다리는 중"}
        </div>
        <p className="tiny" style={{ color: "var(--text-3)", margin: "6px 0 0" }}>
          {session ? `${session.bookAuthor} · 현재 RSVP ${rsvpLabel(session.myRsvpStatus)}` : "새 세션이 열리면 이곳에 표시됩니다."}
        </p>
      </div>
      <div className="surface-quiet rm-home-answer-strip__item">
        <div className="eyebrow">다음 할 일</div>
        <p className="body" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
          {nextAction.message}
        </p>
        <MemberHomeNextActionPace pace={nextAction.pace} />
      </div>
      <div className="surface-quiet rm-home-answer-strip__item">
        <div className="eyebrow">이미 보존된 기록</div>
        <p className="body" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
          {preservedCount > 0
            ? `최근 기록 ${preservedCount}개, 기록 유형 ${preservedKinds}개를 이어 읽을 수 있어요.`
            : "아직 표시할 클럽 기록이 없습니다."}
        </p>
      </div>
    </section>
  );
}

function MobileMemberHome({
  current,
  noteFeedItems,
  upcomingSessions,
  memberName,
  isHost,
  isViewer,
  canWrite,
  canViewPersonalState,
  LinkComponent,
  widgetErrors,
  onRetry,
}: {
  current: CurrentSessionReadPageData;
  noteFeedItems: NoteFeedItem[];
  upcomingSessions: MemberHomeReadView["upcomingSessions"];
  memberName: string;
  isHost: boolean;
  isViewer: boolean;
  canWrite: boolean;
  canViewPersonalState: boolean;
  LinkComponent: MemberHomeLinkComponent;
  widgetErrors?: MemberHomeWidgetErrors;
  onRetry?: MemberHomeRetryHandlers;
}) {
  const session = current.currentSession;
  const nextAction = getMemberHomeNextReadingAction({
    session,
    isViewer,
    canWrite,
    noteFeedItems,
  });
  const recentRecordEntry = getMemberHomeRecentRecordEntry(noteFeedItems);

  return (
    <div className="mobile-only rm-member-home-mobile m-body">
      <section className="rm-member-home-mobile__hero">
        <div className="tiny mono" style={{ color: "var(--text-3)", letterSpacing: "0.1em" }}>
          {formatMobileTodayLabel()}
        </div>
        <h1 className="h2 editorial" style={{ margin: "8px 0 0" }}>
          안녕하세요, {memberName}님.
        </h1>
        <div className="small" style={{ color: "var(--text-2)", marginTop: 4 }}>
          {session ? `다음 모임은 ${session.bookTitle}로 준비 중이에요.` : "다음 세션을 기다리고 있어요."}
        </div>
        {isViewer ? <MobileViewerMemberHomeNotice /> : null}
      </section>

      <section className="m-sec" aria-label="이번 세션">
        <div className="m-eyebrow-row">
          <span className="eyebrow">이번 세션</span>
        </div>
        {widgetErrors?.current ? (
          <MemberHomeWidgetFailure error={widgetErrors.current} onRetry={onRetry?.current} />
        ) : (
          <MobileCurrentSessionCard
            session={session}
            isHost={isHost}
            isViewer={isViewer}
            canWrite={canWrite}
            canViewPersonalState={canViewPersonalState}
            LinkComponent={LinkComponent}
          />
        )}
      </section>

      <MobileTodayActions
        session={session}
        isViewer={isViewer}
        canWrite={canWrite}
        nextActionMessage={nextAction.message}
        pace={nextAction.pace}
        LinkComponent={LinkComponent}
      />
      <section aria-label="예정 세션">
        {widgetErrors?.upcoming ? (
          <MemberHomeWidgetFailure error={widgetErrors.upcoming} onRetry={onRetry?.upcoming} />
        ) : (
          <MobileUpcomingSessions upcomingSessions={upcomingSessions} />
        )}
      </section>
      <section aria-label="최근 기록">
        {widgetErrors?.recentNotes ? (
          <MemberHomeWidgetFailure error={widgetErrors.recentNotes} onRetry={onRetry?.recentNotes} />
        ) : (
          <>
            <MobileRecentRecordEntry entry={recentRecordEntry} LinkComponent={LinkComponent} />
            <MobileMemberActivity items={noteFeedItems.slice(0, 4)} LinkComponent={LinkComponent} />
          </>
        )}
      </section>
      <MobileQuickLinks LinkComponent={LinkComponent} />
    </div>
  );
}

function ViewerMemberHomeNotice() {
  return (
    <section className="surface-quiet" role="note" style={{ padding: 18, marginBottom: 18 }}>
      <p className="eyebrow" style={{ margin: 0 }}>
        둘러보기 멤버
      </p>
      <p className="body" style={{ margin: "6px 0 0", color: "var(--text-2)" }}>
        세션 기록은 읽을 수 있어요. 정식 멤버가 되면 RSVP, 읽기 진행률, 질문 작성 기능이 열립니다.
      </p>
    </section>
  );
}

function MobileViewerMemberHomeNotice() {
  return (
    <div className="m-card-quiet" role="note" style={{ marginTop: 14 }}>
      <p className="eyebrow" style={{ margin: 0 }}>
        둘러보기 멤버
      </p>
      <p className="small" style={{ margin: "6px 0 0", color: "var(--text-2)" }}>
        세션 기록은 읽을 수 있어요. 정식 멤버가 되면 RSVP, 읽기 진행률, 질문 작성 기능이 열립니다.
      </p>
    </div>
  );
}

function MobileQuickLinks({ LinkComponent }: { LinkComponent: MemberHomeLinkComponent }) {
  return (
    <section className="m-sec">
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        바로가기
      </div>
      <div className="rm-mobile-shortcuts">
        {quickLinks.map((item) => (
          <Link key={item.label} to={item.href} className="m-card-quiet" LinkComponent={LinkComponent}>
            <span className="rm-mobile-shortcuts__icon" aria-hidden>
              <MobileIcon name={item.icon} size={22} />
            </span>
            <span className="small" style={{ display: "block", color: "var(--text)", fontWeight: 500 }}>
              {item.label}
            </span>
            <span className="tiny" style={{ color: "var(--text-3)" }}>
              {item.sub}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MobileUpcomingSessions({ upcomingSessions }: { upcomingSessions: MemberHomeReadView["upcomingSessions"] }) {
  if (upcomingSessions.length === 0) {
    return null;
  }

  return (
    <section className="m-sec">
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        예정 세션
      </div>
      <div className="rm-mobile-shortcuts">
        {upcomingSessions.slice(0, 4).map((session) => (
          <div key={session.sessionId} className="m-card-quiet">
            <SessionTimingIdentity sessionNumber={session.sessionNumber} date={session.date} tone="muted" />
            <span className="body editorial" style={{ display: "block", marginTop: 6 }}>
              {session.bookTitle}
            </span>
            <span className="tiny" style={{ color: "var(--text-3)" }}>
              {session.date}
              {session.locationLabel ? ` · ${session.locationLabel}` : ""}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function NextBookHint({ upcomingSessions }: { upcomingSessions: MemberHomeReadView["upcomingSessions"] }) {
  return (
    <section>
      <div className="eyebrow" style={{ marginBottom: "10px" }}>
        다음 달 선정
      </div>
      <div className="surface-quiet" style={{ padding: "20px" }}>
        {upcomingSessions.length > 0 ? (
          <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
            {upcomingSessions.slice(0, 3).map((session) => (
              <div key={session.sessionId}>
                <SessionTimingIdentity sessionNumber={session.sessionNumber} date={session.date} tone="muted" />
                <div className="body editorial" style={{ marginTop: 4 }}>
                  {session.bookTitle}
                </div>
                <div className="tiny" style={{ marginTop: 3 }}>
                  {session.bookAuthor} · {session.date}
                  {session.locationLabel ? ` · ${session.locationLabel}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="small" style={{ color: "var(--text)" }}>
            아직 등록된 다음 달 후보가 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}

function MemberHomeWidgetFailure({
  error,
  onRetry,
}: {
  error: { status?: number; retryAfterSeconds?: number };
  onRetry?: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  let message: ReactNode = "기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";

  if (error.status === 429) {
    message = error.retryAfterSeconds !== undefined
      ? `${error.retryAfterSeconds}초 뒤에 다시 시도해 주세요.`
      : "요청이 많습니다. 잠시 뒤에 다시 시도해 주세요.";
  }

  return (
    <div className="surface-quiet" role="status" style={{ padding: 18, color: "var(--text-2)" }}>
      <p style={{ margin: 0 }}>{message}</p>
      {retryFailed ? (
        <p className="small" style={{ margin: "8px 0 0" }}>
          다시 불러오지 못했습니다. 재시도해 주세요.
        </p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          className="btn btn-quiet"
          disabled={pending}
          aria-busy={pending}
          style={{ marginTop: 14, minHeight: 44 }}
          onClick={() => {
            if (pending) return;
            setPending(true);
            setRetryFailed(false);
            void onRetry()
              .catch(() => setRetryFailed(true))
              .finally(() => setPending(false));
          }}
        >
          {pending ? "불러오는 중" : "다시 시도"}
        </button>
      ) : null}
    </div>
  );
}

function QuickLinks({ LinkComponent }: { LinkComponent: MemberHomeLinkComponent }) {
  return (
    <section>
      <div className="eyebrow" style={{ marginBottom: "10px" }}>
        바로가기
      </div>
      <div className="surface rm-member-home-shortcuts">
        {quickLinks.map((item) => (
          <Link
            key={item.label}
            to={item.href}
            className="rm-member-home-shortcuts__link"
            LinkComponent={LinkComponent}
          >
            <span style={{ flex: 1 }}>
              <span className="body" style={{ display: "block", fontWeight: 500 }}>
                {item.label}
              </span>
              <span className="tiny">{item.sub}</span>
            </span>
            <span className="rm-recent-record__destination-chevron" aria-hidden>
              ›
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
