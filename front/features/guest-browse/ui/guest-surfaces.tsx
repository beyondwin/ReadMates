import type {
  GuestArchiveDetailReadView,
  GuestArchiveSessionReadView,
  GuestHomeReadView,
  GuestNoteFeedItemReadView,
  GuestNotesReadView,
  GuestNoteSessionReadView,
  GuestPage,
  GuestSessionReadView,
} from "@/features/guest-browse/model/guest-read-views";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BookCover } from "@/shared/ui/book-cover";
import { formatDateLabel, formatDeadlineLabel, rsvpLabel } from "@/shared/ui/readmates-display";

type LoadMore = () => Promise<void>;

function appHref(appBasePath: string, path: string) {
  return `${appBasePath}${path}`;
}

function ConversionPrompt({ returnTo }: { returnTo: string }) {
  return (
    <section className="surface-quiet" role="note" style={{ padding: 20 }}>
      <p className="eyebrow" style={{ margin: 0 }}>읽는사이 멤버</p>
      <h2 className="h4 editorial" style={{ margin: "7px 0 0" }}>함께 읽을 준비가 되셨나요?</h2>
      <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 14px" }}>
        멤버로 시작하면 참석 여부와 질문, 나만의 읽기 기록을 이어갈 수 있어요.
      </p>
      <a className="btn btn-primary btn-sm" href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>멤버로 시작</a>
    </section>
  );
}

export function GuestHome({ data, appBasePath = "/app" }: { data: GuestHomeReadView; appBasePath?: string }) {
  const current = data.current.currentSession;
  return (
    <main>
      <section className="page-header-compact">
        <div className="container">
          <p className="eyebrow" style={{ margin: 0 }}>게스트 · 클럽 기록</p>
          <h1 className="h1 editorial" style={{ margin: "8px 0 0" }}>함께 읽어 온 장면들</h1>
          <p className="body" style={{ color: "var(--text-2)", margin: "10px 0 0", maxWidth: 620 }}>
            공개된 세션과 기록을 읽어 보세요. 작성과 참여 기능은 정식 멤버에게 열립니다.
          </p>
        </div>
      </section>
      <section style={{ padding: "28px 0 72px" }}>
        <div className="container stack" style={{ "--stack": "32px" }}>
          <section aria-labelledby="guest-home-current">
            <p className="eyebrow" style={{ margin: "0 0 10px" }}>현재 세션</p>
            {current ? <GuestSessionCard session={current} href={appHref(appBasePath, "/session/current")} /> : <Empty message="현재 공개된 세션이 없습니다." />}
          </section>
          <section aria-labelledby="guest-home-upcoming">
            <h2 id="guest-home-upcoming" className="h3 editorial" style={{ margin: "0 0 14px" }}>다가오는 세션</h2>
            {data.upcoming.items.length ? (
              <div className="stack" style={{ "--stack": "10px" }}>
                {data.upcoming.items.map((session) => (
                  <article key={session.sessionId} className="surface" style={{ padding: 18 }}>
                    <div className="tiny mono" style={{ color: "var(--text-3)" }}>No.{String(session.sessionNumber).padStart(2, "0")} · {formatDateLabel(session.date)}</div>
                    <div className="body editorial" style={{ marginTop: 6 }}>{session.bookTitle}</div>
                    <div className="small" style={{ color: "var(--text-2)", marginTop: 4 }}>{session.bookAuthor} · {session.startTime} – {session.endTime}</div>
                  </article>
                ))}
              </div>
            ) : <Empty message="공개된 예정 세션이 없습니다." />}
          </section>
          <section aria-labelledby="guest-home-notes">
            <div className="row-between" style={{ gap: 16, alignItems: "baseline", marginBottom: 14 }}>
              <h2 id="guest-home-notes" className="h3 editorial" style={{ margin: 0 }}>최근 노트 활동</h2>
              <a className="small" href={appHref(appBasePath, "/notes")}>노트 더 보기</a>
            </div>
            {data.recentNotes.items.length ? <GuestNoteList items={data.recentNotes.items.slice(0, 5)} /> : <Empty message="아직 공개된 노트가 없습니다." />}
          </section>
          <ConversionPrompt returnTo={appBasePath} />
        </div>
      </section>
    </main>
  );
}

function GuestSessionCard({ session, href }: { session: GuestSessionReadView; href: string }) {
  return (
    <a href={href} className="surface" style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr)", gap: 16, padding: 20, color: "inherit", textDecoration: "none" }}>
      <BookCover title={session.bookTitle} author={session.bookAuthor} imageUrl={session.bookImageUrl} width={72} decorative />
      <div>
        <div className="tiny mono" style={{ color: "var(--text-3)" }}>No.{String(session.sessionNumber).padStart(2, "0")} · {formatDateLabel(session.date)}</div>
        <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>{session.bookTitle}</h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "5px 0 0" }}>{session.bookAuthor} · {session.startTime} – {session.endTime}</p>
      </div>
    </a>
  );
}

export function GuestCurrentSession({ data, appBasePath = "/app" }: { data: { currentSession: GuestSessionReadView | null }; appBasePath?: string }) {
  const session = data.currentSession;
  if (!session) return <GuestUnavailable title="현재 공개된 세션이 없습니다" appBasePath={appBasePath} />;
  return (
    <main>
      <section className="page-header-compact"><div className="container">
        <p className="eyebrow" style={{ margin: 0 }}>현재 세션 · 읽기 전용</p>
        <div className="row" style={{ gap: 16, alignItems: "flex-start", marginTop: 12 }}>
          <BookCover title={session.bookTitle} author={session.bookAuthor} imageUrl={session.bookImageUrl} width={72} />
          <div><h1 className="h1 editorial" style={{ margin: 0 }}>{session.bookTitle}</h1><p className="small" style={{ color: "var(--text-2)", margin: "6px 0 0" }}>{session.bookAuthor} · {formatDateLabel(session.date)} · {session.startTime} – {session.endTime}</p></div>
        </div>
        <p className="small" style={{ color: "var(--text-2)", margin: "16px 0 0" }}>질문 마감 · {formatDeadlineLabel(session.questionDeadlineAt)}</p>
      </div></section>
      <section style={{ padding: "30px 0 80px" }}><div className="container stack" style={{ "--stack": "30px" }}>
        <section className="surface-quiet" role="note" style={{ padding: 18 }}><p className="eyebrow" style={{ margin: 0 }}>게스트 둘러보기</p><p className="small" style={{ color: "var(--text-2)", margin: "7px 0 0" }}>세션 내용과 공동 보드는 읽을 수 있습니다. 참여와 작성은 정식 멤버에게 열립니다.</p></section>
        <section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>참석 현황</h2><GuestRoster session={session} /></section>
        <section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>함께 남긴 질문</h2><GuestQuestions questions={session.board.questions} /></section>
        <section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>공개 서평</h2><GuestLongReviews reviews={session.board.longReviews} /></section>
        <ConversionPrompt returnTo={appHref(appBasePath, "/session/current")} />
      </div></section>
    </main>
  );
}

function GuestRoster({ session }: { session: GuestSessionReadView }) {
  if (!session.attendees.length) return <Empty message="공개된 참석 현황이 없습니다." />;
  return <div className="surface" style={{ padding: 18 }}>{session.attendees.map((attendee) => <div key={`${attendee.displayName}-${attendee.avatarKey}`} className="row-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line-soft)" }}><span className="row" style={{ gap: 9 }}><AvatarChip avatarKey={attendee.avatarKey} name={attendee.displayName} /><span className="small">{attendee.displayName}</span></span><span className="tiny" style={{ color: "var(--text-3)" }}>{rsvpLabel(attendee.rsvpStatus)}</span></div>)}</div>;
}

function GuestQuestions({ questions }: { questions: GuestSessionReadView["board"]["questions"] }) {
  return questions.length ? <div className="stack" style={{ "--stack": "10px" }}>{questions.map((question) => <article key={`${question.priority}-${question.text}`} className="surface" style={{ padding: 18 }}><div className="tiny mono" style={{ color: "var(--text-3)" }}>Q{question.priority}</div><p className="body editorial" style={{ margin: "8px 0 0" }}>{question.text}</p>{question.draftThought ? <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 0", whiteSpace: "pre-wrap" }}>{question.draftThought}</p> : null}<p className="tiny" style={{ color: "var(--text-3)", margin: "10px 0 0" }}>{question.authorShortName}</p></article>)}</div> : <Empty message="공개된 질문이 없습니다." />;
}

function GuestLongReviews({ reviews }: { reviews: GuestSessionReadView["board"]["longReviews"] }) {
  return reviews.length ? <div className="stack" style={{ "--stack": "10px" }}>{reviews.map((review) => <article key={`${review.authorShortName}-${review.title}-${review.content}`} className="surface" style={{ padding: 18 }}><p className="eyebrow" style={{ margin: 0 }}>{review.title}</p><p className="body editorial" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{review.content}</p><p className="tiny" style={{ color: "var(--text-3)", margin: "10px 0 0" }}>{review.authorShortName}</p></article>)}</div> : <Empty message="공개된 서평이 없습니다." />;
}

export function GuestNotes({ data, onLoadMoreFeed, onLoadMoreSessions }: { data: GuestNotesReadView; onLoadMoreFeed?: LoadMore; onLoadMoreSessions?: LoadMore }) {
  return <main><section className="page-header-compact"><div className="container"><p className="eyebrow" style={{ margin: 0 }}>클럽 노트 · 읽기 전용</p><h1 className="h1 editorial" style={{ margin: "8px 0 0" }}>함께 남긴 문장들</h1></div></section><section style={{ padding: "28px 0 80px" }}><div className="container stack" style={{ "--stack": "28px" }}><GuestNoteSessions sessions={data.sessions} onLoadMore={onLoadMoreSessions} /><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>노트</h2><GuestNoteList items={data.feed.items} /><LoadMore visible={Boolean(data.feed.nextCursor)} onLoadMore={onLoadMoreFeed} /></section></div></section></main>;
}

function GuestNoteSessions({ sessions, onLoadMore }: { sessions: GuestPage<GuestNoteSessionReadView>; onLoadMore?: LoadMore }) {
  return <section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>세션별 기록</h2>{sessions.items.length ? <div className="stack" style={{ "--stack": "8px" }}>{sessions.items.map((session) => <article key={session.sessionId} className="surface-quiet" style={{ padding: 14 }}><span className="tiny mono" style={{ color: "var(--text-3)" }}>No.{String(session.sessionNumber).padStart(2, "0")} · {formatDateLabel(session.date)}</span><div className="body editorial" style={{ marginTop: 5 }}>{session.bookTitle}</div><div className="tiny" style={{ color: "var(--text-3)", marginTop: 4 }}>공개 기록 {session.totalCount}개</div></article>)}</div> : <Empty message="공개된 세션 기록이 없습니다." />}<LoadMore visible={Boolean(sessions.nextCursor)} onLoadMore={onLoadMore} /></section>;
}

function GuestNoteList({ items }: { items: GuestNoteFeedItemReadView[] }) {
  return items.length ? <div className="stack" style={{ "--stack": "10px" }}>{items.map((item, index) => <article key={`${item.sessionId}-${item.kind}-${item.text}-${index}`} className="surface" style={{ padding: 18 }}><div className="tiny mono" style={{ color: "var(--text-3)" }}>No.{String(item.sessionNumber).padStart(2, "0")} · {item.kind}</div><p className="body editorial" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{item.text}</p>{item.authorShortName ? <p className="tiny" style={{ color: "var(--text-3)", margin: "10px 0 0" }}>{item.authorShortName}</p> : null}</article>)}</div> : <Empty message="공개된 노트가 없습니다." />;
}

export function GuestArchive({ data, appBasePath = "/app", onLoadMore }: { data: GuestPage<GuestArchiveSessionReadView>; appBasePath?: string; onLoadMore?: LoadMore }) {
  return <main><section className="page-header-compact"><div className="container"><p className="eyebrow" style={{ margin: 0 }}>아카이브 · 읽기 전용</p><h1 className="h1 editorial" style={{ margin: "8px 0 0" }}>읽어 온 자리</h1></div></section><section style={{ padding: "28px 0 80px" }}><div className="container">{data.items.length ? <div className="stack" style={{ "--stack": "10px" }}>{data.items.map((session) => <a key={session.sessionId} href={appHref(appBasePath, `/sessions/${encodeURIComponent(session.sessionId)}`)} className="surface" style={{ display: "grid", gridTemplateColumns: "52px minmax(0, 1fr)", gap: 14, padding: 16, color: "inherit", textDecoration: "none" }}><BookCover title={session.bookTitle} author={session.bookAuthor} imageUrl={session.bookImageUrl} width={52} decorative /><div><div className="tiny mono" style={{ color: "var(--text-3)" }}>No.{String(session.sessionNumber).padStart(2, "0")} · {formatDateLabel(session.date)}</div><div className="body editorial" style={{ marginTop: 5 }}>{session.bookTitle}</div><div className="tiny" style={{ color: "var(--text-3)", marginTop: 4 }}>{session.bookAuthor} · 참석 {session.attendance}/{session.total}</div></div></a>)}</div> : <Empty message="공개된 아카이브가 없습니다." />}<LoadMore visible={Boolean(data.nextCursor)} onLoadMore={onLoadMore} /></div></section></main>;
}

export function GuestArchiveDetail({ data, appBasePath = "/app" }: { data: GuestArchiveDetailReadView; appBasePath?: string }) {
  return <main><section className="page-header-compact"><div className="container"><a className="eyebrow" href={appHref(appBasePath, "/archive")}>← 아카이브</a><h1 className="h1 editorial" style={{ margin: "10px 0 0" }}>{data.bookTitle}</h1><p className="small" style={{ color: "var(--text-2)", margin: "7px 0 0" }}>{data.bookAuthor} · {formatDateLabel(data.date)} · 참석 {data.attendance}/{data.total}</p></div></section><section style={{ padding: "28px 0 80px" }}><div className="container stack" style={{ "--stack": "30px" }}><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>요약</h2><div className="surface" style={{ padding: 18 }}><p className="body" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{data.summary ?? "아직 공개된 요약이 없습니다."}</p></div></section><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>회차 기록</h2>{data.highlights.length ? <GuestNoteList items={data.highlights.map((item) => ({ sessionId: data.sessionId, sessionNumber: data.sessionNumber, bookTitle: data.bookTitle, date: data.date, authorName: item.authorName, authorShortName: item.authorShortName, avatarKey: item.avatarKey, kind: "HIGHLIGHT", text: item.text }))} /> : <Empty message="공개된 하이라이트가 없습니다." />}</section><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>함께 남긴 질문</h2><GuestQuestions questions={data.questions} /></section><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>공개 서평</h2><GuestLongReviews reviews={data.longReviews} /></section><section className="surface-quiet" role="note" style={{ padding: 18 }}><p className="eyebrow" style={{ margin: 0 }}>피드백 문서</p><p className="small" style={{ color: "var(--text-2)", margin: "7px 0 0" }}>피드백 문서는 정식 멤버에게만 열립니다.</p></section><ConversionPrompt returnTo={appHref(appBasePath, `/sessions/${encodeURIComponent(data.sessionId)}`)} /></div></section></main>;
}

function GuestUnavailable({ title, appBasePath }: { title: string; appBasePath: string }) { return <main><section className="page-header-compact"><div className="container"><div className="surface-quiet" style={{ padding: 28 }}><h1 className="h2 editorial" style={{ margin: 0 }}>{title}</h1><a className="btn btn-quiet btn-sm" href={appBasePath} style={{ marginTop: 16 }}>클럽 둘러보기</a></div></div></section></main>; }
function Empty({ message }: { message: string }) { return <div className="surface-quiet" role="status" style={{ padding: 18, color: "var(--text-2)" }}>{message}</div>; }
function LoadMore({ visible, onLoadMore }: { visible: boolean; onLoadMore?: LoadMore }) { return visible && onLoadMore ? <div style={{ display: "flex", justifyContent: "center", paddingTop: 18 }}><button type="button" className="btn btn-quiet" onClick={() => void onLoadMore()}>더 보기</button></div> : null; }
