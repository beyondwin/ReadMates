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
  MobileStats,
  MyRecent,
  RosterSummary,
} from "@/features/member-home/components/member-home-records";
import {
  attendanceSummaryFromMyPage,
  type AttendanceSummary,
} from "@/features/member-home/components/member-home-records-utils";
import { PrepCard } from "@/features/member-home/components/prep-card";
import type { AuthMeResponse, CurrentSessionResponse, MyPageResponse, NoteFeedItem } from "@/shared/api/readmates";
import { READMATES_NAV_LABELS, READMATES_WORKSPACE_LABELS } from "@/shared/ui/readmates-copy";

const quickLinks = [
  { label: "피드백 문서", sub: "회차 피드백", href: "/app/archive?view=report", icon: "notes" },
  { label: READMATES_NAV_LABELS.member.archive, sub: "지난 기록", href: "/app/archive", icon: "archive" },
  { label: READMATES_NAV_LABELS.member.clubNotes, sub: "멤버 기록", href: "/app/notes", icon: "book" },
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
  myPage,
}: {
  auth: AuthMeResponse;
  current: CurrentSessionResponse;
  noteFeedItems: NoteFeedItem[];
  myPage?: MyPageResponse | null;
}) {
  const currentSession = current.currentSession;
  const memberName = auth.shortName ?? auth.displayName ?? "멤버";
  const attendanceSummary = attendanceSummaryFromMyPage(myPage);
  const isViewer = auth.membershipStatus === "VIEWER";
  const myRecentItems = noteFeedItems
    .filter((item) => item.authorName === auth.displayName || item.authorShortName === auth.shortName)
    .slice(0, 2);

  return (
    <main>
      <div className="desktop-only rm-member-home-desktop">
        <section style={{ padding: "48px 0 20px" }}>
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
                      이번 달은 <span style={{ color: "var(--accent)" }}>{currentSession.bookAuthor}</span>와 함께예요.
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
              <div className="row" style={{ gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {auth.role === "HOST" ? (
                  <Link to="/app/host" className="btn btn-ghost btn-sm">
                    {READMATES_WORKSPACE_LABELS.hostWorkspace}
                  </Link>
                ) : null}
                <Link to="/app/archive" className="btn btn-ghost btn-sm">
                  {READMATES_NAV_LABELS.member.archive}
                </Link>
                <Link to="/app/session/current" className="btn btn-primary btn-sm">
                  {READMATES_NAV_LABELS.member.currentSession}
                </Link>
              </div>
            </div>

            {isViewer ? <ViewerMemberHomeNotice /> : null}

            <PrepCard session={currentSession} isHost={auth.role === "HOST"} />
          </div>
        </section>

        <section style={{ padding: "40px 0" }}>
          <div className="container">
            <div className="home-grid">
              <div className="stack" style={{ "--stack": "40px" } as CSSProperties}>
                <ClubPulse items={noteFeedItems.slice(0, 3)} />
                <MyRecent items={myRecentItems} />
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
        attendanceSummary={attendanceSummary}
        isViewer={isViewer}
      />
    </main>
  );
}

function MobileMemberHome({
  auth,
  current,
  noteFeedItems,
  memberName,
  attendanceSummary,
  isViewer,
}: {
  auth: AuthMeResponse;
  current: CurrentSessionResponse;
  noteFeedItems: NoteFeedItem[];
  memberName: string;
  attendanceSummary: AttendanceSummary | null;
  isViewer: boolean;
}) {
  const session = current.currentSession;

  return (
    <div className="mobile-only rm-member-home-mobile m-body">
      <section style={{ padding: "12px 18px 4px" }}>
        <div className="tiny mono" style={{ color: "var(--text-3)", letterSpacing: "0.1em" }}>
          {mobileTodayLabel()}
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
          <span className="eyebrow">현재 세션</span>
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
      <MobileStats session={session} attendanceSummary={attendanceSummary} />
      <MobileQuickLinks isHost={auth.role === "HOST"} />
    </div>
  );
}

function mobileTodayLabel() {
  const today = new Date();
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(today);
}

function ViewerMemberHomeNotice() {
  return (
    <section className="surface-quiet" role="note" style={{ padding: 18, marginBottom: 18 }}>
      <p className="eyebrow" style={{ margin: 0 }}>
        둘러보기 멤버
      </p>
      <p className="body" style={{ margin: "6px 0 0", color: "var(--text-2)" }}>
        전체 세션은 볼 수 있어요. 정식 멤버가 되면 RSVP, 체크인, 질문 작성이 열립니다.
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
        전체 세션은 볼 수 있어요. 정식 멤버가 되면 RSVP, 체크인, 질문 작성이 열립니다.
      </p>
    </div>
  );
}

function MobileQuickLinks({ isHost }: { isHost: boolean }) {
  const links = isHost
    ? [
        {
          label: READMATES_WORKSPACE_LABELS.hostWorkspace,
          sub: READMATES_NAV_LABELS.host.operations,
          href: "/app/host",
          icon: "host" as const,
        },
        ...quickLinks,
      ]
    : quickLinks;

  return (
    <section className="m-sec">
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        바로가기
      </div>
      <div className="rm-mobile-shortcuts">
        {links.map((item) => (
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
            <span
              aria-hidden
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "var(--bg-sub)",
                border: "1px solid var(--line-soft)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-2)",
              }}
            >
              ↗
            </span>
            <span style={{ flex: 1 }}>
              <span className="body" style={{ display: "block", fontWeight: 500 }}>
                {item.label}
              </span>
              <span className="tiny">{item.sub}</span>
            </span>
            <span className="tiny" aria-hidden>
              ›
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
