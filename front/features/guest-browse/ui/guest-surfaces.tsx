import { useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import type {
  GuestArchiveDetailReadView,
  GuestArchiveSessionReadView,
  GuestHomeReadView,
  GuestNoteFeedItemReadView,
  GuestNotesReadView,
  GuestPage,
  GuestSessionReadView,
} from "@/features/guest-browse/model/guest-read-views";
import { guestNoteKindLabel } from "@/features/guest-browse/model/guest-read-views";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BookCover } from "@/shared/ui/book-cover";
import { formatDateLabel } from "@/shared/ui/readmates-display";
import { loginPathForReturnTo } from "@/shared/auth/login-return";
import SharedNotesFeedPage from "@/shared/ui/notes-feed-page";

type LoadMore = () => Promise<void>;
export type GuestSurfaceLinkProps = { to: string; className?: string; style?: CSSProperties; children: ReactNode; "aria-label"?: string };
type GuestSurfaceProps = { appBasePath?: string; returnTo?: string; LinkComponent?: ComponentType<GuestSurfaceLinkProps> };

function BrowserLink({ to, children, ...props }: GuestSurfaceLinkProps) {
  return <a href={to} {...props}>{children}</a>;
}

function appHref(appBasePath: string, path: string) {
  return `${appBasePath}${path}`;
}

function ConversionPrompt({ returnTo, LinkComponent = BrowserLink }: { returnTo: string; LinkComponent?: ComponentType<GuestSurfaceLinkProps> }) {
  return (
    <section className="surface-quiet" role="note" style={{ padding: 20 }}>
      <p className="eyebrow" style={{ margin: 0 }}>읽는사이 멤버</p>
      <h2 className="h4 editorial" style={{ margin: "7px 0 0" }}>함께 읽을 준비가 되셨나요?</h2>
      <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 14px" }}>
        멤버로 시작하면 참석 여부와 질문, 나만의 읽기 기록을 이어갈 수 있어요.
      </p>
      <LinkComponent className="btn btn-primary btn-sm" to={loginPathForReturnTo(returnTo)}>멤버로 시작</LinkComponent>
    </section>
  );
}

export function GuestHome({ data, appBasePath = "/app", returnTo = appBasePath, LinkComponent = BrowserLink, onRetry }: { data: GuestHomeReadView; onRetry?: Partial<Record<"current" | "upcoming" | "recentNotes", LoadMore>> } & GuestSurfaceProps) {
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
            <p id="guest-home-current" className="eyebrow" style={{ margin: "0 0 10px" }}>현재 세션</p>
            {data.widgetErrors?.current ? <WidgetFailure error={data.widgetErrors.current} onRetry={onRetry?.current} /> : current ? <GuestSessionCard session={current} href={appHref(appBasePath, "/session/current")} LinkComponent={LinkComponent} /> : <Empty message="현재 공개된 세션이 없습니다." />}
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
            ) : data.widgetErrors?.upcoming ? <WidgetFailure error={data.widgetErrors.upcoming} onRetry={onRetry?.upcoming} /> : <Empty message="공개된 예정 세션이 없습니다." />}
          </section>
          <section aria-labelledby="guest-home-notes">
            <div className="row-between" style={{ gap: 16, alignItems: "baseline", marginBottom: 14 }}>
              <h2 id="guest-home-notes" className="h3 editorial" style={{ margin: 0 }}>최근 노트 활동</h2>
              <LinkComponent className="small" to={appHref(appBasePath, "/notes")}>노트 더 보기</LinkComponent>
            </div>
            {data.recentNotes.items.length ? <GuestNoteList items={data.recentNotes.items.slice(0, 5)} /> : data.widgetErrors?.recentNotes ? <WidgetFailure error={data.widgetErrors.recentNotes} onRetry={onRetry?.recentNotes} /> : <Empty message="아직 공개된 노트가 없습니다." />}
          </section>
          <ConversionPrompt returnTo={returnTo} LinkComponent={LinkComponent} />
        </div>
      </section>
    </main>
  );
}

function GuestSessionCard({ session, href, LinkComponent = BrowserLink }: { session: GuestSessionReadView; href: string; LinkComponent?: ComponentType<GuestSurfaceLinkProps> }) {
  return (
    <LinkComponent to={href} className="surface" style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr)", gap: 16, padding: 20, color: "inherit", textDecoration: "none" }}>
      <BookCover title={session.bookTitle} author={session.bookAuthor} imageUrl={session.bookImageUrl} width={72} decorative />
      <div>
        <div className="tiny mono" style={{ color: "var(--text-3)" }}>No.{String(session.sessionNumber).padStart(2, "0")} · {formatDateLabel(session.date)}</div>
        <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>{session.bookTitle}</h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "5px 0 0" }}>{session.bookAuthor} · {session.startTime} – {session.endTime}</p>
      </div>
    </LinkComponent>
  );
}

function GuestQuestions({ questions }: { questions: GuestSessionReadView["board"]["questions"] }) {
  return questions.length ? <div className="stack" style={{ "--stack": "10px" }}>{questions.map((question) => <article key={`${question.priority}-${question.text}`} className="surface" style={{ padding: 18 }}><div className="tiny mono" style={{ color: "var(--text-3)" }}>Q{question.priority}</div><p className="body editorial" style={{ margin: "8px 0 0" }}>{question.text}</p>{question.draftThought ? <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 0", whiteSpace: "pre-wrap" }}>{question.draftThought}</p> : null}<p className="tiny" style={{ color: "var(--text-3)", margin: "10px 0 0" }}>{question.authorName}</p></article>)}</div> : <Empty message="공개된 질문이 없습니다." />;
}

function GuestLongReviews({ reviews }: { reviews: GuestSessionReadView["board"]["longReviews"] }) {
  return reviews.length ? <div className="stack" style={{ "--stack": "10px" }}>{reviews.map((review) => <article key={`${review.authorShortName}-${review.title}-${review.content}`} className="surface" style={{ padding: 18 }}><p className="eyebrow" style={{ margin: 0 }}>{review.title}</p><p className="body editorial" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{review.content}</p><p className="tiny" style={{ color: "var(--text-3)", margin: "10px 0 0" }}>{review.authorName}</p></article>)}</div> : <Empty message="공개된 서평이 없습니다." />;
}

export function GuestNotes({ data, selectedSessionId, appBasePath = "/app", LinkComponent = BrowserLink, onLoadMoreFeed, onLoadMoreSessions }: { data: GuestNotesReadView; selectedSessionId?: string | null; onLoadMoreFeed?: LoadMore; onLoadMoreSessions?: LoadMore } & GuestSurfaceProps) {
  const sessions = { items: data.sessions.items.map((session) => ({ ...session })), nextCursor: data.sessions.nextCursor };
  const items = { items: data.feed.items.map((item) => ({ ...item, avatarKey: item.avatarKey ?? "book" })), nextCursor: data.feed.nextCursor };
  const selectedSession = sessions.items.find((session) => session.sessionId === selectedSessionId) ?? sessions.items[0] ?? null;
  const GuestNotesLink = ({ to, ...props }: GuestSurfaceLinkProps) => <LinkComponent {...props} to={appHref(appBasePath, to.replace(/^\/app/, ""))} />;
  return <SharedNotesFeedPage items={items} noteSessions={sessions} selectedSessionId={selectedSession?.sessionId ?? null} selectedSession={selectedSession} LinkComponent={GuestNotesLink} copy={{ questionLabel: "질문", oneLinerLabel: "한줄평", description: "공개된 하이라이트·한줄평·질문을 세션별로 읽어 볼 수 있습니다." }} onLoadMoreItems={onLoadMoreFeed} onLoadMoreNoteSessions={onLoadMoreSessions} />;
}

function GuestNoteList({ items }: { items: GuestNoteFeedItemReadView[] }) {
  return items.length ? <div className="stack" style={{ "--stack": "10px" }}>{items.map((item, index) => <article key={`${item.sessionId}-${item.kind}-${item.text}-${index}`} className="surface" style={{ padding: 18 }}><div className="tiny mono" style={{ color: "var(--text-3)" }}>No.{String(item.sessionNumber).padStart(2, "0")} · {guestNoteKindLabel(item.kind)}</div><p className="body editorial" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{item.text}</p>{item.authorName ? <p className="tiny" style={{ color: "var(--text-3)", margin: "10px 0 0" }}>{item.authorName}</p> : null}</article>)}</div> : <Empty message="공개된 노트가 없습니다." />;
}

export function GuestArchive({ data, appBasePath = "/app", onLoadMore, LinkComponent = BrowserLink }: { data: GuestPage<GuestArchiveSessionReadView>; onLoadMore?: LoadMore } & GuestSurfaceProps) {
  return <main><section className="page-header-compact"><div className="container"><p className="eyebrow" style={{ margin: 0 }}>아카이브 · 읽기 전용</p><h1 className="h1 editorial" style={{ margin: "8px 0 0" }}>읽어 온 자리</h1></div></section><section style={{ padding: "28px 0 80px" }}><div className="container">{data.items.length ? <div className="stack" style={{ "--stack": "10px" }}>{data.items.map((session) => <LinkComponent key={session.sessionId} to={appHref(appBasePath, `/sessions/${encodeURIComponent(session.sessionId)}`)} className="surface" style={{ display: "grid", gridTemplateColumns: "52px minmax(0, 1fr)", gap: 14, padding: 16, color: "inherit", textDecoration: "none" }}><BookCover title={session.bookTitle} author={session.bookAuthor} imageUrl={session.bookImageUrl} width={52} decorative /><div><div className="tiny mono" style={{ color: "var(--text-3)" }}>No.{String(session.sessionNumber).padStart(2, "0")} · {formatDateLabel(session.date)}</div><div className="body editorial" style={{ marginTop: 5 }}>{session.bookTitle}</div><div className="tiny" style={{ color: "var(--text-3)", marginTop: 4 }}>{session.bookAuthor} · 참석 {session.attendance}/{session.total}</div></div></LinkComponent>)}</div> : <Empty message="공개된 아카이브가 없습니다." />}<LoadMore visible={Boolean(data.nextCursor)} onLoadMore={onLoadMore} /></div></section></main>;
}

export function GuestArchiveDetail({ data, appBasePath = "/app", returnTo = appBasePath, LinkComponent = BrowserLink }: { data: GuestArchiveDetailReadView } & GuestSurfaceProps) {
  return <main><section className="page-header-compact"><div className="container"><LinkComponent className="eyebrow" to={appHref(appBasePath, "/archive")}>← 아카이브</LinkComponent><h1 className="h1 editorial" style={{ margin: "10px 0 0" }}>{data.bookTitle}</h1><p className="small" style={{ color: "var(--text-2)", margin: "7px 0 0" }}>{data.bookAuthor} · {formatDateLabel(data.date)} · 참석 {data.attendance}/{data.total}</p></div></section><section style={{ padding: "28px 0 80px" }}><div className="container stack" style={{ "--stack": "30px" }}><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>요약</h2><div className="surface" style={{ padding: 18 }}><p className="body" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{data.summary ?? "아직 공개된 요약이 없습니다."}</p></div></section><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>회차 기록</h2>{data.highlights.length ? <GuestNoteList items={data.highlights.map((item) => ({ sessionId: data.sessionId, sessionNumber: data.sessionNumber, bookTitle: data.bookTitle, date: data.date, authorName: item.authorName, authorShortName: item.authorShortName, avatarKey: item.avatarKey, kind: "HIGHLIGHT", text: item.text }))} /> : <Empty message="공개된 하이라이트가 없습니다." />}</section><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>함께 남긴 질문</h2><GuestQuestions questions={data.questions} /></section><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>한줄평</h2>{data.oneLiners.length ? <div className="stack" style={{ "--stack": "10px" }}>{data.oneLiners.map((item, index) => <article key={`${item.authorName}-${item.text}-${index}`} className="surface" style={{ padding: 18 }}><p className="body editorial" style={{ margin: 0 }}>{item.text}</p><div className="row" style={{ gap: 8, marginTop: 10 }}><AvatarChip avatarKey={item.avatarKey} name={item.authorName} /><span className="tiny" style={{ color: "var(--text-3)" }}>{item.authorName}</span></div></article>)}</div> : <Empty message="공개된 한줄평이 없습니다." />}</section><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>공개 서평</h2><GuestLongReviews reviews={data.longReviews} /></section><section className="surface-quiet" role="note" style={{ padding: 18 }}><p className="eyebrow" style={{ margin: 0 }}>피드백 문서</p><p className="small" style={{ color: "var(--text-2)", margin: "7px 0 12px" }}>피드백 문서는 정식 멤버에게만 열립니다.</p><LinkComponent className="btn btn-quiet btn-sm" to={appHref(appBasePath, `/feedback/${encodeURIComponent(data.sessionId)}`)} aria-label="피드백 보기, 정식 멤버 전용">피드백 보기</LinkComponent></section><ConversionPrompt returnTo={returnTo} LinkComponent={LinkComponent} /></div></section></main>;
}

function Empty({ message }: { message: string }) { return <div className="surface-quiet" role="status" style={{ padding: 18, color: "var(--text-2)" }}>{message}</div>; }
function WidgetFailure({ error, onRetry }: { error: { status?: number; retryAfterSeconds?: number }; onRetry?: LoadMore }) { return <div className="surface-quiet" role="status" style={{ padding: 18, color: "var(--text-2)" }}><p style={{ margin: 0 }}>{error.status === 429 ? error.retryAfterSeconds ? `${error.retryAfterSeconds}초 뒤에 다시 시도해 주세요.` : "요청이 많습니다. 잠시 뒤에 다시 시도해 주세요." : "기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}</p>{onRetry ? <LoadMore visible onLoadMore={onRetry} /> : null}</div>; }
function LoadMore({ visible, onLoadMore }: { visible: boolean; onLoadMore?: LoadMore }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!visible || !onLoadMore) return null;
  return <div style={{ display: "grid", justifyContent: "center", gap: 8, paddingTop: 18 }}>
    {failed ? <p className="small" role="status" style={{ color: "var(--text-2)", margin: 0 }}>기록을 더 불러오지 못했습니다. 다시 시도해 주세요.</p> : null}
    <button type="button" className="btn btn-quiet" disabled={pending} aria-busy={pending} style={{ minHeight: 44 }} onClick={() => {
      if (pending) return;
      setPending(true); setFailed(false);
      void onLoadMore().catch(() => setFailed(true)).finally(() => setPending(false));
    }}>{pending ? "불러오는 중" : failed ? "다시 시도" : "더 보기"}</button>
  </div>;
}
