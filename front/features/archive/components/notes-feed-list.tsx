import { type CSSProperties } from "react";
import type { NoteFeedItem, NoteSessionItem } from "@/shared/api/readmates";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

export type FeedFilter = "all" | "questions" | "oneliners" | "highlights" | "checkins";

const filters: Array<{ key: FeedFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "questions", label: "질문" },
  { key: "oneliners", label: "한줄평" },
  { key: "highlights", label: "하이라이트" },
  { key: "checkins", label: "읽기 흔적" },
];

function itemKey(item: NoteFeedItem) {
  return `${item.sessionId}-${item.kind}-${item.authorName ?? "no-author"}-${item.text}`;
}

function sessionNumberLabel(item: NoteFeedItem) {
  return `No.${String(item.sessionNumber).padStart(2, "0")}`;
}

function noteKindLabel(item: NoteFeedItem) {
  if (item.kind === "QUESTION") {
    return "질문";
  }

  if (item.kind === "ONE_LINE_REVIEW") {
    return "한줄평";
  }

  if (item.kind === "HIGHLIGHT") {
    return "하이라이트";
  }

  return "읽기 흔적";
}

function byKind(items: NoteFeedItem[], kind: string) {
  return items.filter((item) => item.kind === kind);
}

function filterKind(filter: FeedFilter) {
  if (filter === "questions") {
    return "QUESTION";
  }

  if (filter === "oneliners") {
    return "ONE_LINE_REVIEW";
  }

  if (filter === "highlights") {
    return "HIGHLIGHT";
  }

  if (filter === "checkins") {
    return "CHECKIN";
  }

  return null;
}

export function NotesFilterBar({ filter, onFilterChange }: { filter: FeedFilter; onFilterChange: (filter: FeedFilter) => void }) {
  return (
    <div className="row" style={{ marginTop: "24px", gap: "6px", flexWrap: "wrap" }} aria-label="클럽 노트 필터">
      {filters.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={filter === item.key}
          onClick={() => onFilterChange(item.key)}
          style={{
            height: "32px",
            padding: "0 14px",
            fontSize: "13px",
            borderRadius: "999px",
            border: `1px solid ${filter === item.key ? "var(--text)" : "var(--line)"}`,
            background: filter === item.key ? "var(--text)" : "transparent",
            color: filter === item.key ? "var(--bg)" : "var(--text-2)",
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function FeedSections({
  items,
  filter,
  selectedSession,
  hasNoteSessions,
}: {
  items: NoteFeedItem[];
  filter: FeedFilter;
  selectedSession: NoteSessionItem | null;
  hasNoteSessions: boolean;
}) {
  if (!hasNoteSessions || !selectedSession) {
    return <NotesEmptyState message="아직 발행된 세션 기록이 없습니다." />;
  }

  if (items.length === 0) {
    return <NotesEmptyState message="이 세션에는 아직 공개된 기록이 없습니다." />;
  }

  const selectedKind = filterKind(filter);
  const filteredItems = selectedKind ? byKind(items, selectedKind) : items;

  if (filteredItems.length === 0) {
    return <NotesEmptyState message="이 세션에는 해당 기록이 없습니다." />;
  }

  return (
    <>
      <NotesFeedListStyles />
      {(filter === "all" || filter === "questions") && <FeedQuestions items={byKind(items, "QUESTION")} />}
      {(filter === "all" || filter === "oneliners") && <FeedOneLiners items={byKind(items, "ONE_LINE_REVIEW")} />}
      {(filter === "all" || filter === "highlights") && <FeedHighlights items={byKind(items, "HIGHLIGHT")} />}
      {(filter === "all" || filter === "checkins") && <FeedCheckins items={byKind(items, "CHECKIN")} />}
    </>
  );
}

function NotesEmptyState({ message }: { message: string }) {
  return (
    <div
      className="surface-quiet"
      role="status"
      style={{
        padding: "28px",
        borderRadius: "var(--r-2)",
        color: "var(--text-2)",
      }}
    >
      {message}
    </div>
  );
}

function FeedQuestions({ items }: { items: NoteFeedItem[] }) {
  return (
    <FeedSection eyebrow={`질문 · ${items.length}`} title="이번 달의 질문들">
      <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
        {items.map((item, index) => (
          <article
            key={itemKey(item)}
            style={{
              padding: "24px 0",
              borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
            }}
          >
            <FeedAuthorRow item={item} rightLabel={formatDateOnlyLabel(item.date)} markerSize={22} style={{ gap: "10px", marginBottom: "12px" }}>
              <span className="tiny mono">{sessionNumberLabel(item)} · {noteKindLabel(item)}</span>
            </FeedAuthorRow>
            <div className="body editorial" style={{ fontSize: "18px", lineHeight: 1.55 }}>
              {item.text}
            </div>
          </article>
        ))}
      </div>
    </FeedSection>
  );
}

function FeedOneLiners({ items }: { items: NoteFeedItem[] }) {
  return (
    <FeedSection eyebrow={`한줄평 · ${items.length}`} title="짧게 남긴 서평">
      <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
        {items.map((item, index) => (
          <article
            key={itemKey(item)}
            className="rm-notes-excerpt-row"
            style={{
              padding: "22px 0",
              borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
            }}
          >
            <div className="quote editorial" style={{ fontSize: "17px", margin: 0 }}>
              {item.text}
            </div>
            <FeedAuthorRow item={item} rightLabel={`${sessionNumberLabel(item)} · ${formatDateOnlyLabel(item.date)}`} markerSize={20} style={{ marginTop: "14px" }} />
          </article>
        ))}
      </div>
    </FeedSection>
  );
}

function FeedHighlights({ items }: { items: NoteFeedItem[] }) {
  return (
    <FeedSection eyebrow={`하이라이트 · ${items.length}`} title="남은 문장들">
      <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
        {items.map((item, index) => (
          <div
            key={itemKey(item)}
            style={{
              padding: "24px 0",
              borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
            }}
          >
            <div className="quote editorial" style={{ fontSize: "18px" }}>
              {item.text}
            </div>
            <FeedAuthorRow item={item} rightLabel={`${sessionNumberLabel(item)} · ${item.bookTitle}`} markerSize={20} style={{ gap: "10px", marginTop: "10px" }} />
          </div>
        ))}
      </div>
    </FeedSection>
  );
}

function FeedCheckins({ items }: { items: NoteFeedItem[] }) {
  return (
    <FeedSection eyebrow={`읽기 흔적 · ${items.length}`} title="읽기 흔적">
      <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
        {items.map((item, index) => (
          <div
            key={itemKey(item)}
            className="rm-notes-checkin-row"
            style={{
              padding: "20px 0",
              borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
              display: "grid",
              gridTemplateColumns: "minmax(100px, 120px) minmax(52px, 64px) minmax(0, 1fr) auto",
              gap: "20px",
              alignItems: "center",
            }}
          >
            <span className="row" style={{ gap: "8px", minWidth: 0 }}>
              {item.authorName ? (
                <AvatarChip name={item.authorName} fallbackInitial={item.authorShortName} label={item.authorName} size={20} />
              ) : null}
              {item.authorName ? (
                <span className="small" style={{ fontWeight: 500 }}>
                  {item.authorName}
                </span>
              ) : null}
            </span>
            <span className="mono small" style={{ color: "var(--text-2)" }}>
              {sessionNumberLabel(item)}
            </span>
            <span className="small" style={{ color: "var(--text-2)" }}>
              {item.text}
            </span>
            <span className="tiny mono">{formatDateOnlyLabel(item.date)}</span>
          </div>
        ))}
      </div>
    </FeedSection>
  );
}

function FeedSection({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ paddingBottom: "44px" }}>
      <div className="row" style={{ marginBottom: "20px", gap: "14px", alignItems: "baseline" }}>
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="h3 editorial" style={{ margin: 0 }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function NotesFeedListStyles() {
  return (
    <style>{`
      @media (max-width: 768px) {
        .rm-notes-excerpt-row .quote {
          border-bottom: 0;
        }

        .rm-notes-checkin-row {
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 6px !important;
          align-items: start !important;
        }

        .rm-notes-checkin-row > span:last-child {
          justify-self: start;
          color: var(--text-3);
        }
      }
    `}</style>
  );
}

function FeedAuthorRow({
  item,
  rightLabel,
  markerSize,
  children,
  style,
}: {
  item: NoteFeedItem;
  rightLabel: string;
  markerSize: number;
  children?: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="row" style={{ gap: "8px", color: "var(--text-3)", ...style }}>
      {item.authorName ? (
        <AvatarChip name={item.authorName} fallbackInitial={item.authorShortName} label={item.authorName} size={markerSize} />
      ) : null}
      {item.authorName ? <span className="small">{item.authorName}</span> : null}
      {children}
      <span className="tiny mono" style={{ marginLeft: "auto" }}>
        {rightLabel}
      </span>
    </div>
  );
}
