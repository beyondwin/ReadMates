import { Link } from "@/src/app/router-link";
import { type CSSProperties } from "react";
import {
  MobileCurrentSessionCard,
  MobileIcon,
  type MobileIconName,
  MobileTodayActions,
} from "@/features/member-home/components/member-home-current-session";
import {
  ClubPulse,
  MobileMemberActivity,
  RosterSummary,
} from "@/features/member-home/components/member-home-records";
import { PrepCard } from "@/features/member-home/components/prep-card";
import type {
  MemberHomeAuth as AuthMeResponse,
  MemberHomeCurrentSessionResponse as CurrentSessionResponse,
  MemberHomeNoteFeedItem as NoteFeedItem,
} from "@/features/member-home/api/member-home-contracts";
import { formatMobileTodayLabel, rsvpLabel } from "@/shared/ui/readmates-display";

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
  auth,
  current,
  noteFeedItems,
}: {
  auth: AuthMeResponse;
  current: CurrentSessionResponse;
  noteFeedItems: NoteFeedItem[];
}) {
  const currentSession = current.currentSession;
  const memberName = auth.shortName ?? auth.displayName ?? "멤버";
  const isViewer = auth.membershipStatus === "VIEWER";

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

            <HomeAnswerStrip session={currentSession} noteFeedItems={noteFeedItems} isViewer={isViewer} />

            <PrepCard session={currentSession} isHost={auth.role === "HOST"} isViewer={isViewer} />
          </div>
        </section>

        <section style={{ padding: "40px 0" }}>
          <div className="container">
            <div className="home-grid">
              <div className="stack" style={{ "--stack": "40px" } as CSSProperties}>
                <ClubPulse items={noteFeedItems.slice(0, 3)} />
              </div>
              <div className="stack" style={{ "--stack": "24px" } as CSSProperties}>
                <RosterSummary current={current} />
                <NextBookHint />
                <QuickLinks />
              </div>
            </div>
          </div>
        </section>
      </div>

      <MobileMemberHome
        auth={auth}
        current={current}
        noteFeedItems={noteFeedItems}
        memberName={memberName}
        isViewer={isViewer}
      />
    </main>
  );
}

function nextActionFor(session: NonNullable<CurrentSessionResponse["currentSession"]> | null, isViewer: boolean) {
  if (!session) {
    return isViewer ? "다음 세션이 열리면 읽기 전용으로 확인할 수 있어요." : "호스트가 세션을 열면 준비를 시작합니다.";
  }

  if (isViewer) {
    return "세션을 읽고 공동 보드를 확인할 수 있어요.";
  }

  if (session.myRsvpStatus === "NO_RESPONSE") {
    return "RSVP를 먼저 선택해 주세요.";
  }

  if (!session.myCheckin) {
    return "읽기 진행률을 남겨 주세요.";
  }

  if (session.myQuestions.length < 2) {
    return `질문 ${2 - session.myQuestions.length}개를 더 준비해 주세요.`;
  }

  if (!session.myOneLineReview) {
    return "한줄평을 한 문장으로 남겨 주세요.";
  }

  return "준비가 정리되었습니다. 모임 전까지 수정할 수 있어요.";
}

function HomeAnswerStrip({
  session,
  noteFeedItems,
  isViewer,
}: {
  session: CurrentSessionResponse["currentSession"];
  noteFeedItems: NoteFeedItem[];
  isViewer: boolean;
}) {
  const preservedCount = noteFeedItems.length;
  const preservedKinds = new Set(noteFeedItems.map((item) => item.kind)).size;

  return (
    <section className="rm-home-answer-strip" aria-label="홈 요약">
      <div className="surface-quiet rm-home-answer-strip__item">
        <div className="eyebrow">지금 읽는 책</div>
        <div className="body editorial" style={{ fontSize: "17px", marginTop: "8px" }}>
          {session ? session.bookTitle : "다음 책을 기다리는 중"}
        </div>
        <p className="tiny" style={{ color: "var(--text-3)", margin: "6px 0 0" }}>
          {session ? `${session.bookAuthor} · 현재 RSVP ${rsvpLabel(session.myRsvpStatus)}` : "새 세션이 열리면 이곳에 표시됩니다."}
        </p>
      </div>
      <div className="surface-quiet rm-home-answer-strip__item">
        <div className="eyebrow">다음 할 일</div>
        <p className="body" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
          {nextActionFor(session, isViewer)}
        </p>
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
  auth,
  current,
  noteFeedItems,
  memberName,
  isViewer,
}: {
  auth: AuthMeResponse;
  current: CurrentSessionResponse;
  noteFeedItems: NoteFeedItem[];
  memberName: string;
  isViewer: boolean;
}) {
  const session = current.currentSession;

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

      <section className="m-sec">
        <div className="m-eyebrow-row">
          <span className="eyebrow">이번 세션</span>
          {session ? (
            <span className="tiny mono" style={{ color: "var(--text-3)" }}>
              No.{String(session.sessionNumber).padStart(2, "0")}
            </span>
          ) : null}
        </div>
        <MobileCurrentSessionCard session={session} isHost={auth.role === "HOST"} isViewer={isViewer} />
      </section>

      <MobileTodayActions session={session} isViewer={isViewer} />
      <MobileMemberActivity items={noteFeedItems.slice(0, 4)} />
      <MobileQuickLinks />
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

function MobileQuickLinks() {
  return (
    <section className="m-sec">
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        바로가기
      </div>
      <div className="rm-mobile-shortcuts">
        {quickLinks.map((item) => (
          <Link key={item.label} to={item.href} className="m-card-quiet">
            <span className="rm-mobile-shortcuts__icon" aria-hidden>
              <MobileIcon name={item.icon} size={18} />
            </span>
            <span className="body" style={{ display: "block", fontSize: 13.5, fontWeight: 500 }}>
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

function NextBookHint() {
  return (
    <section>
      <div className="eyebrow" style={{ marginBottom: "10px" }}>
        다음 달 선정
      </div>
      <div className="surface-quiet" style={{ padding: "20px" }}>
        <div className="body" style={{ fontSize: "14px" }}>
          아직 등록된 다음 달 후보가 없습니다.
        </div>
      </div>
    </section>
  );
}

function QuickLinks() {
  return (
    <section>
      <div className="eyebrow" style={{ marginBottom: "10px" }}>
        바로가기
      </div>
      <div className="surface" style={{ padding: "4px", overflow: "hidden" }}>
        {quickLinks.map((item, index) => (
          <Link
            key={item.label}
            to={item.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              width: "100%",
              padding: "14px 16px",
              borderRadius: "6px",
              borderTop: index > 0 ? "1px solid var(--line-soft)" : "none",
              textAlign: "left",
              color: "var(--text)",
            }}
          >
            <span style={{ flex: 1 }}>
              <span className="body" style={{ display: "block", fontWeight: 500 }}>
                {item.label}
              </span>
              <span className="tiny">{item.sub}</span>
            </span>
            <span className="tiny" aria-hidden>
              &gt;
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
