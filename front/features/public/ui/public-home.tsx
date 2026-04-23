import { Link } from "@/features/public/ui/public-link";
import type { PublicClubView, PublicSessionListItemView } from "@/features/public/model/public-display-model";
import { BookCover } from "@/shared/ui/book-cover";
import { PublicGuestOnlyActions, PublicInviteGuidance } from "@/shared/ui/public-auth-action";
import { getPublicClubDisplay, getPublicSessionListItemDisplay } from "@/features/public/model/public-display-model";
import { PUBLIC_MEMBERSHIP_NOTE } from "@/features/public/model/public-copy";

type PublicHomeProps = {
  data: PublicClubView;
};

function sessionHref(session: PublicSessionListItemView) {
  return `/sessions/${encodeURIComponent(session.sessionId)}`;
}

function sessionDisplay(session: PublicSessionListItemView) {
  return getPublicSessionListItemDisplay(session);
}

function RecordBadges({ session }: { session: PublicSessionListItemView }) {
  const display = sessionDisplay(session);

  return (
    <div className="row public-record-badges">
      <span className="badge">공개 요약</span>
      <span className="badge">하이라이트 {display.highlightCount}</span>
      <span className="badge">한줄평 {display.oneLinerCount}</span>
    </div>
  );
}

function EmptyPublicRecords() {
  return (
    <div className="rm-empty-state public-empty-record">
      <div className="eyebrow">공개 기록</div>
      <h2 className="h3 editorial" style={{ margin: "10px 0 0" }}>
        아직 발행된 공개 기록이 없습니다
      </h2>
      <p className="body" style={{ margin: "12px 0 0" }}>
        모임 이후 공개 가능한 요약, 하이라이트, 한줄평이 정리되면 이곳에 차례로 쌓입니다.
      </p>
    </div>
  );
}

function EmptySecondaryPublicRecords() {
  return (
    <div className="rm-empty-state public-empty-record">
      <div className="eyebrow">공개 기록</div>
      <h2 className="h3 editorial" style={{ margin: "10px 0 0" }}>
        대표 기록 외 추가 공개 기록은 아직 없습니다
      </h2>
      <p className="body" style={{ margin: "12px 0 0" }}>
        다음 공개 기록이 발행되면 최근 대표 기록 아래의 노트와 색인에도 이어서 표시됩니다.
      </p>
    </div>
  );
}

function LatestRecordFeature({ session }: { session: PublicSessionListItemView | null }) {
  if (!session) {
    return <EmptyPublicRecords />;
  }

  const display = sessionDisplay(session);

  return (
    <Link to={sessionHref(session)} className="rm-document-panel public-latest-record" aria-label={`최근 공개 기록 ${display.title} 보기`}>
      <div className="public-latest-record__cover">
        <BookCover title={display.title} author={display.author} imageUrl={session.bookImageUrl} width={132} />
      </div>
      <div className="public-latest-record__body">
        <div className="eyebrow">최근 공개 기록 · No.{session.sessionNumber}</div>
        <h2 className="h2 editorial" style={{ margin: "10px 0 0" }}>
          {display.title}
        </h2>
        <p className="small" style={{ margin: "6px 0 0", color: "var(--text-2)" }}>
          {display.author} · {display.date}
        </p>
        <p className="body" style={{ margin: "18px 0 0", color: "var(--text-2)" }}>
          {display.summary}
        </p>
        <RecordBadges session={session} />
      </div>
    </Link>
  );
}

function ArchiveRecordRow({ session }: { session: PublicSessionListItemView }) {
  const display = sessionDisplay(session);

  return (
    <Link to={sessionHref(session)} className="rm-record-row public-archive-row">
      <BookCover
        title={display.title}
        author={display.author}
        imageUrl={session.bookImageUrl}
        width={48}
        className="public-archive-row__cover"
        decorative
      />
      <span className="public-archive-row__main">
        <span className="editorial public-archive-row__title">{display.title}</span>
        <span className="small public-archive-row__meta">
          {display.author} · {display.date}
        </span>
      </span>
      <span className="public-archive-row__counts">
        <span>하이라이트 {display.highlightCount}</span>
        <span>한줄평 {display.oneLinerCount}</span>
      </span>
    </Link>
  );
}

function SummaryExcerpt({ session }: { session: PublicSessionListItemView }) {
  const display = sessionDisplay(session);

  return (
    <Link to={sessionHref(session)} className="rm-record-row public-note-row">
      <span className="mono tiny">No.{session.sessionNumber}</span>
      <span>
        <span className="quote-card__quote editorial">{display.summary}</span>
        <span className="small" style={{ display: "block", marginTop: 10, color: "var(--text-3)" }}>
          {display.title} · {display.author}
        </span>
      </span>
    </Link>
  );
}

function ReadingRhythm() {
  const rhythm = [
    ["모임 전", "책을 읽고 각자 나누고 싶은 질문을 준비합니다."],
    ["모임 중", "정답보다 서로의 해석이 어디서 갈라지는지 듣습니다."],
    ["모임 후", "공개 가능한 요약, 하이라이트, 한줄평만 기록으로 발행합니다."],
  ];

  return (
    <div className="public-ledger-list">
      {rhythm.map(([label, body], index) => (
        <div className="rm-ledger-row public-ledger-row" key={label}>
          <span className="mono tiny">{String(index + 1).padStart(2, "0")}</span>
          <span className="eyebrow">{label}</span>
          <span className="body editorial">{body}</span>
        </div>
      ))}
    </div>
  );
}

function PublicRecordGuide({ hasPublishedRecords }: { hasPublishedRecords: boolean }) {
  const guide = [
    ["첫 화면", "가장 최근에 발행한 기록을 대표 자료로 먼저 보여줍니다."],
    ["기록 목록", "발행된 공개 기록은 번호순으로 이어지는 목록에서 다시 확인할 수 있습니다."],
    ["멤버 공간", "참여자 전용 피드백과 개인 노트는 정식 멤버 공간에만 남깁니다."],
  ];

  return (
    <div className="rm-document-panel public-membership-panel">
      <div className="public-ledger-list">
        {guide.map(([label, body], index) => (
          <div className="rm-ledger-row public-ledger-row" key={label}>
            <span className="mono tiny">{String(index + 1).padStart(2, "0")}</span>
            <span className="eyebrow">{label}</span>
            <span className="body editorial">{body}</span>
          </div>
        ))}
      </div>
      <div className="public-membership-panel__actions">
        <Link to="/records" className="btn btn-primary">
          {hasPublishedRecords ? "공개 기록 보기" : "공개 기록 준비 중"}
        </Link>
      </div>
    </div>
  );
}

export default function PublicHome({ data }: PublicHomeProps) {
  const latestSession = data.recentSessions[0] ?? null;
  const secondarySessions = latestSession
    ? data.recentSessions.filter((session) => session.sessionId !== latestSession.sessionId)
    : data.recentSessions;
  const publicRecordPreviewSessions = data.recentSessions.slice(0, 3);
  const { clubName, tagline, about, stats } = getPublicClubDisplay(data);

  return (
    <main className="page-frame public-home">
      <section className="public-home-hero">
        <div className="container public-home-hero__grid">
          <div className="public-home-hero__copy">
            <div className="eyebrow" style={{ marginBottom: 16 }}>
              작게 읽고 깊게 나누는 모임
            </div>
            <h1 className="display editorial" style={{ margin: 0 }}>
              {clubName}
            </h1>
            <p className="body-lg public-editorial-promise">{tagline}</p>
            <p className="body" style={{ color: "var(--text-2)", marginTop: 18, maxWidth: 560 }}>
              {about}
            </p>
            <div className="public-actions">
              <Link to="/records" className="btn btn-primary btn-lg">
                최근 공개 기록 보기
              </Link>
              <Link to="/about" className="btn btn-ghost btn-lg">
                클럽 소개 보기
              </Link>
            </div>
          </div>
          <div className="public-home-hero__peek" aria-label="다음 섹션 미리보기">
            <span className="eyebrow">다음</span>
            <span className="body editorial">최근 기록과 클럽의 읽는 방식</span>
          </div>
          <div className="public-home-hero__latest">
            <LatestRecordFeature session={latestSession} />
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="container public-grid-2">
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              공개 기록
            </div>
            <h2 className="h2 editorial" style={{ margin: 0 }}>
              공개한 모임 기록을 모았습니다
            </h2>
          </div>
          <div className="public-record-facts">
            <div>
              <span className="mono tiny">RECORDS</span>
              <strong>{stats.sessions}</strong>
              <span>공개 모임</span>
            </div>
            <div>
              <span className="mono tiny">BOOKS</span>
              <strong>{stats.books}</strong>
              <span>읽은 책</span>
            </div>
            <div>
              <span className="mono tiny">MEMBERS</span>
              <strong>{stats.members}</strong>
              <span>정식 멤버</span>
            </div>
          </div>
        </div>
        <div className="container" style={{ marginTop: 24 }}>
          <PublicRecordGuide hasPublishedRecords={data.recentSessions.length > 0} />
        </div>
      </section>

      <section className="public-section public-section--subtle">
        <div className="container public-grid-2">
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              클럽 리듬
            </div>
            <h2 className="h2 editorial" style={{ margin: 0 }}>
              우리는 이렇게 읽습니다
            </h2>
          </div>
          <ReadingRhythm />
        </div>
      </section>

      <section className="public-section">
        <div className="container public-grid-2">
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              공개 노트
            </div>
            <h2 className="h2 editorial" style={{ margin: 0 }}>
              기록은 대화의 일부만 남깁니다
            </h2>
            <p className="body" style={{ color: "var(--text-2)", marginTop: 14 }}>
              비공개 준비 과정과 참석자 전용 피드백은 멤버 공간에 남기고, 외부에는 공개 가능한 요약만 발행합니다.
            </p>
          </div>
          {secondarySessions.length > 0 ? (
            <div className="public-note-list">
              {secondarySessions.slice(0, 3).map((session) => (
                <SummaryExcerpt key={session.sessionId} session={session} />
              ))}
            </div>
          ) : latestSession ? (
            <EmptySecondaryPublicRecords />
          ) : (
            <EmptyPublicRecords />
          )}
        </div>
      </section>

      <section className="public-section public-section--subtle">
        <div className="container public-grid-2">
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              멤버십 경계
            </div>
            <h2 className="h2 editorial" style={{ margin: 0 }}>
              공개 기록은 열려 있고, 참여는 초대제로 운영합니다
            </h2>
          </div>
          <div className="rm-document-panel public-membership-panel">
            <p className="body" style={{ margin: 0, color: "var(--text-2)" }}>
              {PUBLIC_MEMBERSHIP_NOTE}
            </p>
            <div className="public-membership-panel__actions">
              <PublicGuestOnlyActions>
                <Link to="/login" className="btn btn-primary">
                  기존 멤버 로그인
                </Link>
                <PublicInviteGuidance />
              </PublicGuestOnlyActions>
            </div>
            <p className="tiny" style={{ margin: "14px 0 0", color: "var(--text-3)" }}>
              새 멤버 참여는 호스트가 보낸 초대 링크가 있을 때만 열립니다.
            </p>
          </div>
        </div>
      </section>

      <section className="public-section" id="public-records">
        <div className="container">
          <div className="row-between public-section-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                공개 기록
              </div>
              <h2 className="h2 editorial" style={{ margin: 0 }}>
                공개 기록
              </h2>
            </div>
            <Link to="/records" className="public-records-link">
              전체 보기
              <span aria-hidden>→</span>
            </Link>
          </div>
          {publicRecordPreviewSessions.length > 0 ? (
            <div className="public-record-list">
              {publicRecordPreviewSessions.map((session) => (
                <ArchiveRecordRow key={session.sessionId} session={session} />
              ))}
            </div>
          ) : latestSession ? (
            <EmptySecondaryPublicRecords />
          ) : (
            <EmptyPublicRecords />
          )}
        </div>
      </section>
    </main>
  );
}
