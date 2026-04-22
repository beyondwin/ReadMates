import { Link } from "@/src/app/router-link";
import type { PublicClubResponse, PublicSessionListItem } from "@/shared/api/readmates";
import { BookCover } from "@/shared/ui/book-cover";
import { displayText, formatDateLabel, nonNegativeCount } from "@/shared/ui/readmates-display";
import { PUBLIC_INTRODUCTION_FALLBACK, PUBLIC_MEMBERSHIP_NOTE, PUBLIC_TAGLINE_FALLBACK } from "./public-club-copy";

type PublicHomeProps = {
  data: PublicClubResponse;
};

function sessionHref(session: PublicSessionListItem) {
  return `/sessions/${session.sessionId}`;
}

function sessionDisplay(session: PublicSessionListItem) {
  return {
    title: displayText(session.bookTitle, "도서 제목 미정"),
    author: displayText(session.bookAuthor, "저자 미상"),
    date: formatDateLabel(session.date),
    summary: displayText(session.summary, "공개 요약이 아직 준비되지 않았습니다."),
    highlightCount: nonNegativeCount(session.highlightCount),
    oneLinerCount: nonNegativeCount(session.oneLinerCount),
  };
}

function RecordBadges({ session }: { session: PublicSessionListItem }) {
  const display = sessionDisplay(session);

  return (
    <div className="row public-record-badges">
      <span className="badge">공개 요약</span>
      <span className="badge">하이라이트 {display.highlightCount}</span>
      <span className="badge">한줄평 {display.oneLinerCount}</span>
    </div>
  );
}

function LatestRecordCard({ session }: { session: PublicSessionListItem | null }) {
  if (!session) {
    return (
      <aside>
        <div className="eyebrow" style={{ marginBottom: "16px" }}>
          공개 기록
        </div>
        <div className="surface" style={{ padding: "28px" }}>
          <div className="h3 editorial">아직 공개된 기록이 없습니다</div>
          <p className="body" style={{ color: "var(--text-2)", marginTop: "12px" }}>
            공개 가능한 모임 기록이 생기면 이곳에 가장 최근 기록이 표시됩니다.
          </p>
        </div>
      </aside>
    );
  }

  const display = sessionDisplay(session);

  return (
    <aside>
      <div className="eyebrow" style={{ marginBottom: "16px" }}>
        최근 공개 기록 · No.{session.sessionNumber}
      </div>
      <Link to={sessionHref(session)} className="surface" style={{ display: "block", padding: "28px" }}>
        <div className="row" style={{ alignItems: "flex-start", gap: "20px" }}>
          <BookCover title={display.title} author={display.author} imageUrl={session.bookImageUrl} width={96} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="eyebrow">발행된 독서</div>
            <div className="h3 editorial" style={{ marginTop: "6px" }}>
              {display.title}
            </div>
            <div className="small" style={{ marginTop: "4px" }}>
              {display.author}
            </div>
            <hr className="divider-soft" style={{ margin: "16px 0" }} />
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                columnGap: "16px",
                rowGap: "8px",
                margin: 0,
              }}
            >
              <dt className="eyebrow">날짜</dt>
              <dd style={{ margin: 0 }}>{display.date}</dd>
              <dt className="eyebrow">기록</dt>
              <dd style={{ margin: 0 }}>No.{session.sessionNumber}</dd>
            </dl>
          </div>
        </div>
      </Link>
      <div className="tiny mono" style={{ marginTop: "14px", textAlign: "right" }}>
        공개 기록은 모임 이후 발행된 요약과 한줄평을 기준으로 보여요.
      </div>
    </aside>
  );
}

function MobileLatestSessionLink({ session }: { session: PublicSessionListItem }) {
  const display = sessionDisplay(session);

  return (
    <Link to={sessionHref(session)} className="m-card" style={{ display: "block", padding: 20 }}>
      <div className="m-row-between" style={{ marginBottom: 16 }}>
        <span className="eyebrow">최근 공개 기록</span>
        <span className="tiny mono" style={{ color: "var(--text-3)" }}>
          No.{session.sessionNumber}
        </span>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <BookCover title={display.title} author={display.author} imageUrl={session.bookImageUrl} width={76} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="editorial" style={{ fontSize: 19, lineHeight: 1.3, margin: "0 0 6px" }}>
            {display.title}
          </h2>
          <div className="small" style={{ color: "var(--text-2)" }}>
            {display.author}
          </div>
          <div className="tiny" style={{ color: "var(--text-3)", marginTop: 10, lineHeight: 1.6 }}>
            {display.summary}
          </div>
        </div>
      </div>
    </Link>
  );
}

function MobileSummaryLink({ session }: { session: PublicSessionListItem }) {
  const display = sessionDisplay(session);

  return (
    <Link
      to={sessionHref(session)}
      className="m-card"
      style={{
        width: 252,
        margin: 0,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 180,
      }}
    >
      <div className="editorial" style={{ fontSize: 16, lineHeight: 1.5, color: "var(--text)" }}>
        {display.summary}
      </div>
      <div className="tiny" style={{ marginTop: 18, color: "var(--text-3)" }}>
        No.{session.sessionNumber} · {display.title}
      </div>
      <RecordBadges session={session} />
    </Link>
  );
}

function NotebookLeadCard({ session }: { session: PublicSessionListItem }) {
  const display = sessionDisplay(session);

  return (
    <div className="surface" style={{ padding: "28px" }}>
      <div className="eyebrow">
        No.{session.sessionNumber} · {display.date} · {display.author} 『{display.title}』
      </div>
      <div className="h3 editorial" style={{ marginTop: "14px" }}>
        {display.summary}
      </div>
      <RecordBadges session={session} />
    </div>
  );
}

function NotebookSessionLink({ session }: { session: PublicSessionListItem }) {
  const display = sessionDisplay(session);

  return (
    <Link to={sessionHref(session)} className="surface quote-card">
      <div className="quote-card__quote editorial">{display.summary}</div>
      <div className="row" style={{ marginTop: "14px", gap: "8px", color: "var(--text-3)" }}>
        <span className="badge">No.{session.sessionNumber}</span>
        <span className="small">{display.title}</span>
      </div>
      <RecordBadges session={session} />
    </Link>
  );
}

function MobilePublicHome({ data }: PublicHomeProps) {
  const latestSession = data.recentSessions[0] ?? null;
  const clubName = displayText(data.clubName, "읽는사이");
  const tagline = displayText(data.tagline, PUBLIC_TAGLINE_FALLBACK);
  const about = displayText(data.about, PUBLIC_INTRODUCTION_FALLBACK);
  const stats = {
    sessions: nonNegativeCount(data.stats.sessions),
    books: nonNegativeCount(data.stats.books),
    members: nonNegativeCount(data.stats.members),
  };

  return (
    <div className="m-body" style={{ paddingTop: 0 }}>
      <section style={{ padding: "40px 22px 28px" }}>
        <div className="eyebrow" style={{ marginBottom: 18 }}>
          {clubName} · {tagline}
        </div>
        <h1 className="editorial" style={{ fontSize: 44, lineHeight: 1.05, margin: 0, fontWeight: 400 }}>
          사이에 남는
          <br />
          읽기의 흔적.
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--text-2)", marginTop: 22, maxWidth: 320 }}>
          {about}
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-2)", marginTop: 14, maxWidth: 340 }}>
          {PUBLIC_MEMBERSHIP_NOTE}
        </p>
      </section>

      <section style={{ padding: "4px 22px 28px" }}>
        {latestSession ? (
          <MobileLatestSessionLink session={latestSession} />
        ) : (
          <div className="m-card" style={{ padding: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              최근 공개 기록
            </div>
            <div className="body">아직 공개된 기록이 없습니다.</div>
          </div>
        )}
      </section>

      <section style={{ padding: "4px 22px 28px" }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          우리의 리듬
        </div>
        <div className="m-card" style={{ padding: "4px 20px" }}>
          {[
            ["모임 전", "질문을 우선순위로 정리"],
            ["모임 중", "1순위 질문부터 차례로 대화"],
            ["모임 이후", "한줄평과 공개 가능한 기록 발행"],
          ].map(([when, copy], index) => (
            <div
              key={when}
              style={{
                display: "grid",
                gridTemplateColumns: "96px 1fr",
                gap: 14,
                alignItems: "baseline",
                padding: "16px 0",
                borderTop: index === 0 ? 0 : "1px solid var(--line-soft)",
              }}
            >
              <span className="tiny mono" style={{ color: "var(--text-3)" }}>
                {when}
              </span>
              <span className="body" style={{ fontSize: 14, lineHeight: 1.55 }}>
                {copy}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "4px 0 28px" }}>
        <div style={{ padding: "0 22px 14px" }}>
          <div className="m-row-between">
            <span className="eyebrow">공개 요약</span>
            <span className="tiny mono" style={{ color: "var(--text-3)" }}>
              {data.recentSessions.length} 기록
            </span>
          </div>
        </div>
        {data.recentSessions.length > 0 ? (
          <div className="m-hscroll">
            {data.recentSessions.map((session) => (
              <MobileSummaryLink key={session.sessionId} session={session} />
            ))}
          </div>
        ) : (
          <div style={{ padding: "0 22px" }}>
            <div className="m-card" style={{ padding: 18 }}>
              공개된 요약이 없습니다.
            </div>
          </div>
        )}
      </section>

      <section style={{ padding: "4px 22px 28px" }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          지금까지
        </div>
        <div className="m-stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {[
            [stats.sessions, "모임"],
            [stats.books, "권"],
            [stats.members, "멤버"],
          ].map(([value, label]) => (
            <div key={label} className="m-card-quiet" style={{ padding: 16, textAlign: "center" }}>
              <div className="editorial" style={{ fontSize: 26, lineHeight: 1 }}>
                {value}
              </div>
              <div className="tiny mono" style={{ color: "var(--text-3)", marginTop: 8 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function PublicHome({ data }: PublicHomeProps) {
  const latestSession = data.recentSessions[0] ?? null;
  const latestHref = latestSession ? sessionHref(latestSession) : "/about";
  const clubName = displayText(data.clubName, "읽는사이");
  const tagline = displayText(data.tagline, PUBLIC_TAGLINE_FALLBACK);
  const about = displayText(data.about, PUBLIC_INTRODUCTION_FALLBACK);

  return (
    <main className="page-frame">
      <div className="desktop-only">
        <section style={{ padding: "96px 0 40px", borderBottom: "1px solid var(--line)" }}>
          <div className="container public-hero">
            <div>
              <div className="eyebrow" style={{ marginBottom: "20px" }}>
                {clubName} · {tagline}
              </div>
              <h1 className="display editorial" style={{ margin: 0 }}>
                <span style={{ display: "block" }}>책을 읽고,</span>
                <span style={{ display: "block" }}>사람을 읽고,</span>
                <span style={{ display: "block", color: "var(--accent)" }}>세상을 읽는 시간.</span>
              </h1>
              <p className="body-lg" style={{ color: "var(--text-2)", marginTop: "28px", maxWidth: "520px" }}>
                {about}
              </p>
              <p className="body" style={{ color: "var(--text-2)", marginTop: "16px", maxWidth: "560px" }}>
                {PUBLIC_MEMBERSHIP_NOTE}
              </p>
              <div className="public-actions">
                <Link to={latestHref} className="btn btn-primary btn-lg">
                  {latestSession ? "최근 공개 기록 보기" : "클럽 소개 보기"}
                </Link>
                <Link to="/about" className="btn btn-ghost btn-lg">
                  클럽 소개
                </Link>
              </div>
            </div>
            <LatestRecordCard session={latestSession} />
          </div>
        </section>

        <section style={{ padding: "80px 0" }}>
          <div className="container">
            <div className="eyebrow" style={{ marginBottom: "8px" }}>
              우리가 소중히 여기는 것
            </div>
            <h2 className="h2 editorial" style={{ margin: 0 }}>
              조용한 대화를 소중히 여깁니다
            </h2>
            <div className="public-grid-3" style={{ marginTop: "32px" }}>
              {[
                ["01", "머무름", "결론을 서두르지 않고, 서로의 생각 사이에 머무르는 여유를 가집니다."],
                ["02", "경청", "말하기만큼 잘 듣는 것을 중요하게 여깁니다. 해석은 교정의 대상이 아닙니다."],
                ["03", "관점의 다리", "목적은 정답이 아니라, 서로의 관점 사이에 다리를 놓는 일입니다."],
              ].map(([index, title, body]) => (
                <div key={index} style={{ paddingTop: "28px", borderTop: "1px solid var(--line)" }}>
                  <div className="mono tiny" style={{ letterSpacing: "0.12em" }}>
                    {index}
                  </div>
                  <div className="h3 editorial" style={{ marginTop: "16px" }}>
                    {title}
                  </div>
                  <p className="body" style={{ color: "var(--text-2)", marginTop: "10px" }}>
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            padding: "40px 0 80px",
            background: "var(--bg-sub)",
            borderTop: "1px solid var(--line)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div className="container">
            <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "24px" }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: "8px" }}>
                  클럽 노트에서
                </div>
                <h2 className="h2 editorial" style={{ margin: 0 }}>
                  공개된 기록 몇 조각
                </h2>
              </div>
              <Link to={latestHref} className="btn btn-ghost btn-sm public-records-link">
                <span>전체 공개 기록</span>
                <span aria-hidden>→</span>
              </Link>
            </div>

            {latestSession ? (
              <div className="public-grid-2">
                <NotebookLeadCard session={latestSession} />

                <div className="public-stack">
                  {data.recentSessions.slice(1, 4).map((session) => (
                    <NotebookSessionLink key={session.sessionId} session={session} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="surface" style={{ padding: "28px" }}>
                공개된 기록이 없습니다.
              </div>
            )}
          </div>
        </section>

        <section style={{ padding: "80px 0" }}>
          <div className="container container-sm">
            <div className="eyebrow" style={{ marginBottom: "8px" }}>
              우리의 리듬
            </div>
            <h2 className="h2 editorial" style={{ margin: 0 }}>
              한 달의 흐름
            </h2>
            <div className="public-stack" style={{ marginTop: "28px", gap: 0 }}>
              {[
                ["읽기", "각자의 속도로 책을 읽고 질문을 준비합니다."],
                ["대화", "우선순위가 높은 질문부터 차례로 이야기합니다."],
                ["기록", "모임 이후 공개 가능한 요약과 한줄평을 남깁니다."],
              ].map(([week, copy], index) => (
                <div
                  key={week}
                  className="row"
                  style={{
                    padding: "18px 0",
                    borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
                    gap: "24px",
                    alignItems: "baseline",
                  }}
                >
                  <span className="mono tiny" style={{ width: "80px", color: "var(--text-3)" }}>
                    {week}
                  </span>
                  <span className="body editorial" style={{ fontSize: "17px", color: "var(--text)" }}>
                    {copy}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="mobile-only">
        <MobilePublicHome data={data} />
      </div>
    </main>
  );
}
