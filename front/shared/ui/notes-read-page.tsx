import { useState, type CSSProperties } from "react";
import { formatDateLabel } from "@/shared/ui/readmates-display";
import { noteSessionIsSelected } from "@/shared/model/notes-read-primitives";

export type NotesReadSession = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  totalCount: number;
};

export type NotesReadItem<K extends string> = {
  sessionId: string;
  sessionNumber: number;
  kind: K;
  text: string;
  authorName?: string;
};

type Page<T> = { items: T[]; nextCursor: string | null };
type LoadMore = () => Promise<void>;

function notesFilterChoiceStyle(selected: boolean): CSSProperties {
  return {
    height: "32px",
    padding: "0 14px",
    fontSize: "var(--type-size-control)",
    borderRadius: "999px",
    border: `1px solid ${selected ? "var(--text)" : "var(--line)"}`,
    background: selected ? "var(--text)" : "transparent",
    color: selected ? "var(--bg)" : "var(--text-2)",
  };
}

export function NotesFilterChoices<F extends string>({ filters, selected, onSelect, className, style }: { filters: readonly { id: F; label: string }[]; selected: F; onSelect: (filter: F) => void; className?: string; style?: CSSProperties }) {
  return (
    <div className={className} style={style} aria-label="클럽 노트 필터">
      {filters.map(({ id, label }) => {
        const isSelected = selected === id;

        return (
          <button key={id} type="button" aria-pressed={isSelected} style={notesFilterChoiceStyle(isSelected)} onClick={() => onSelect(id)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Read-only counterpart to the member NotesFeedPage interaction model.
 * Callers provide their own typed kinds and data adapters, so this primitive
 * cannot reach a protected API or accidentally expose member-write controls.
 */
export function NotesReadPage<K extends string, F extends string>({
  sessions,
  feed,
  filters,
  matchesFilter,
  kindLabel,
  onLoadMoreFeed,
  onLoadMoreSessions,
}: {
  sessions: Page<NotesReadSession>;
  feed: Page<NotesReadItem<K>>;
  filters: readonly { id: F; label: string }[];
  matchesFilter: (kind: K, filter: F) => boolean;
  kindLabel: (kind: K) => string;
  onLoadMoreFeed?: LoadMore;
  onLoadMoreSessions?: LoadMore;
}) {
  const [filter, setFilter] = useState(filters[0]?.id);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessions.items[0]?.sessionId ?? null);
  const visibleItems = feed.items.filter((item) =>
    (!selectedSessionId || item.sessionId === selectedSessionId) && (!filter || matchesFilter(item.kind, filter)),
  );

  return <main><section className="page-header-compact"><div className="container"><p className="eyebrow" style={{ margin: 0 }}>클럽 노트 · 읽기 전용</p><h1 className="h1 editorial" style={{ margin: "8px 0 0" }}>함께 남긴 문장들</h1><NotesFilterChoices filters={filters} selected={filter ?? filters[0].id} onSelect={setFilter} className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 16 }} /></div></section><section style={{ padding: "28px 0 80px" }}><div className="container stack" style={{ "--stack": "28px" }}><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>세션별 기록</h2>{sessions.items.length ? <div className="stack" style={{ "--stack": "8px" }}>{sessions.items.map((session) => <button key={session.sessionId} type="button" className="surface-quiet" aria-pressed={noteSessionIsSelected(session.sessionId, selectedSessionId)} onClick={() => setSelectedSessionId(session.sessionId)} style={{ padding: 14, textAlign: "left", minHeight: 44 }}><span className="tiny mono" style={{ color: "var(--text-3)" }}>No.{String(session.sessionNumber).padStart(2, "0")} · {formatDateLabel(session.date)}</span><div className="body editorial" style={{ marginTop: 5 }}>{session.bookTitle}</div><div className="tiny" style={{ color: "var(--text-3)", marginTop: 4 }}>공개 기록 {session.totalCount}개</div></button>)}</div> : <NotesReadEmpty message="공개된 세션 기록이 없습니다." />}<NotesLoadMore visible={Boolean(sessions.nextCursor)} onLoadMore={onLoadMoreSessions} /></section><section><h2 className="h3 editorial" style={{ margin: "0 0 12px" }}>노트</h2>{visibleItems.length ? <div className="stack" style={{ "--stack": "10px" }}>{visibleItems.map((item, index) => <article key={`${item.sessionId}-${item.kind}-${item.text}-${index}`} className="surface" style={{ padding: 18 }}><div className="tiny mono" style={{ color: "var(--text-3)" }}>No.{String(item.sessionNumber).padStart(2, "0")} · {kindLabel(item.kind)}</div><p className="body editorial" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{item.text}</p>{item.authorName ? <p className="tiny" style={{ color: "var(--text-3)", margin: "10px 0 0" }}>{item.authorName}</p> : null}</article>)}</div> : <NotesReadEmpty message="공개된 노트가 없습니다." />}<NotesLoadMore visible={Boolean(feed.nextCursor)} onLoadMore={onLoadMoreFeed} /></section></div></section></main>;
}

export function NotesReadEmpty({ message }: { message: string }) { return <div className="surface-quiet" role="status" style={{ padding: 18, color: "var(--text-2)" }}>{message}</div>; }
export function NotesLoadMore({ visible, onLoadMore }: { visible: boolean; onLoadMore?: LoadMore }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!visible || !onLoadMore) return null;
  return <div style={{ display: "grid", justifyContent: "center", gap: 8, paddingTop: 18 }}>
    {failed ? <p className="small" role="status" style={{ color: "var(--text-2)", margin: 0 }}>기록을 더 불러오지 못했습니다. 다시 시도해 주세요.</p> : null}
    <button type="button" className="btn btn-quiet" disabled={pending} aria-busy={pending} style={{ minHeight: 44 }} onClick={() => { if (pending) return; setPending(true); setFailed(false); void onLoadMore().catch(() => setFailed(true)).finally(() => setPending(false)); }}>{pending ? "불러오는 중" : failed ? "다시 시도" : "더 보기"}</button>
  </div>;
}
