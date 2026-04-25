import { type CSSProperties } from "react";
import type { FeedFilter, NoteFeedItem, NoteSessionItem } from "@/features/archive/model/notes-feed-model";
import {
  byKind,
  filterKind,
  itemKey,
  noteFeedFilters,
  noteCountOrZero,
  visibleNoteCount,
} from "@/features/archive/model/notes-feed-model";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

export type { FeedFilter };

export function NotesFilterBar({
  filter,
  onFilterChange,
  selectedSession,
}: {
  filter: FeedFilter;
  onFilterChange: (filter: FeedFilter) => void;
  selectedSession: NoteSessionItem | null;
}) {
  return (
    <div className="row" style={{ marginTop: "24px", gap: "6px", flexWrap: "wrap" }} aria-label="클럽 노트 필터">
      {noteFeedFilters.map((item) => {
        const count = selectedSession ? noteFilterCount(selectedSession, item.key) : null;

        return (
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
            {count === null ? item.label : `${item.label} ${count}`}
          </button>
        );
      })}
    </div>
  );
}

function noteFilterCount(session: NoteSessionItem, filter: FeedFilter) {
  if (filter === "highlights") {
    return noteCountOrZero(session.highlightCount);
  }

  if (filter === "oneliners") {
    return noteCountOrZero(session.oneLinerCount);
  }

  if (filter === "questions") {
    return noteCountOrZero(session.questionCount);
  }

  return visibleNoteCount(session);
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

  const visibleItems = items.filter((item) => item.kind !== "LONG_REVIEW");

  if (visibleItems.length === 0) {
    return <NotesEmptyState message="이 세션에는 아직 공개된 기록이 없습니다." />;
  }

  const selectedKind = filterKind(filter);
  const filteredItems = selectedKind ? byKind(visibleItems, selectedKind) : visibleItems;

  if (filteredItems.length === 0) {
    return <NotesEmptyState message="이 세션에는 해당 기록이 없습니다." />;
  }

  return (
    <>
      <NotesFeedListStyles />
      {(filter === "all" || filter === "highlights") && <FeedHighlights items={byKind(visibleItems, "HIGHLIGHT")} />}
      {(filter === "all" || filter === "oneliners") && <FeedOneLiners items={byKind(visibleItems, "ONE_LINE_REVIEW")} />}
      {(filter === "all" || filter === "questions") && <FeedQuestions items={byKind(visibleItems, "QUESTION")} />}
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
    <FeedSection label="내 질문" count={items.length} detail="읽으며 붙든 질문">
      <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
        {items.map((item, index) => (
          <article
            key={itemKey(item)}
            style={{
              padding: "24px 0",
              borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
            }}
          >
            <FeedAuthorRow item={item} rightLabel={formatDateOnlyLabel(item.date)} markerSize={22} style={{ gap: "10px", marginBottom: "12px" }} />
            <div className="body editorial rm-notes-question-text" style={{ fontSize: "16px", lineHeight: 1.58 }}>
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
    <FeedSection label="내 한줄평" count={items.length} detail="짧게 남긴 감상">
      <div className="rm-notes-oneliner-grid">
        {items.map((item) => (
          <article key={itemKey(item)} className="rm-notes-oneliner-card">
            <p className="rm-notes-oneliner-card__quote editorial">{item.text}</p>
            <FeedAuthorRow item={item} markerSize={22} style={{ gap: "10px", marginTop: "12px", paddingLeft: "34px" }} />
          </article>
        ))}
      </div>
    </FeedSection>
  );
}

function FeedHighlights({ items }: { items: NoteFeedItem[] }) {
  return (
    <FeedSection label="하이라이트" count={items.length} detail="남은 문장들">
      <div className="rm-notes-highlight-list">
        {items.map((item) => (
          <article key={itemKey(item)} className="rm-notes-highlight-row">
            <p className="rm-notes-highlight-row__quote editorial">{item.text}</p>
            <FeedAuthorRow item={item} markerSize={20} style={{ gap: "10px", marginTop: "10px", paddingLeft: "34px" }} />
          </article>
        ))}
      </div>
    </FeedSection>
  );
}

function FeedSection({
  label,
  count,
  detail,
  children,
}: {
  label: string;
  count: number;
  detail: string;
  children: React.ReactNode;
}) {
  const accessibleHeading = `${label} · ${count}`;

  return (
    <section style={{ paddingBottom: "44px" }}>
      <div className="row-between" style={{ marginBottom: "20px", gap: "18px", alignItems: "baseline", flexWrap: "wrap" }}>
        <div className="row" style={{ gap: "14px", alignItems: "baseline", flexWrap: "wrap", minWidth: 0 }}>
          <h2 className="eyebrow rm-notes-section-title" style={{ margin: 0 }} aria-label={accessibleHeading}>
            <span>{label}</span>
            <span className="rm-notes-section-title__dot" aria-hidden="true">
              ·
            </span>
            <span className="rm-notes-section-title__count" aria-hidden="true">
              {count}
            </span>
          </h2>
        </div>
        <span className="tiny mono" style={{ color: "var(--text-3)", flex: "0 0 auto", whiteSpace: "nowrap" }}>
          {detail}
        </span>
      </div>
      {children}
    </section>
  );
}

function NotesFeedListStyles() {
  return (
    <style>{`
      .rm-notes-oneliner-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }

      .rm-notes-oneliner-card {
        min-height: 126px;
        padding: 24px 28px;
        border: 1px solid var(--line);
        border-radius: var(--r-3);
        background: color-mix(in oklch, var(--bg), var(--bg-raised) 48%);
      }

      .rm-notes-oneliner-card__quote {
        position: relative;
        margin: 0;
        padding-left: 34px;
        color: var(--text);
        font-size: 17px;
        font-weight: 600;
        line-height: 1.45;
        letter-spacing: 0;
      }

      .rm-notes-oneliner-card__quote::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0.16em;
        width: 3px;
        min-height: 30px;
        height: calc(100% - 0.32em);
        background: var(--accent);
      }

      .rm-notes-highlight-list {
        border-top: 1px solid var(--line);
      }

      .rm-notes-highlight-row {
        padding: 24px 0 26px;
        border-bottom: 1px solid var(--line-soft);
      }

      .rm-notes-highlight-row__quote {
        position: relative;
        max-width: 920px;
        margin: 0;
        padding-left: 34px;
        color: var(--text);
        font-size: 18px;
        font-weight: 600;
        line-height: 1.45;
        letter-spacing: 0;
      }

      .rm-notes-highlight-row__quote::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0.2em;
        width: 3px;
        min-height: 24px;
        height: calc(100% - 0.4em);
        background: var(--accent);
      }

      .rm-notes-section-title {
        display: inline-flex;
        align-items: baseline;
        gap: 2px;
        letter-spacing: 0;
      }

      .rm-notes-section-title__dot {
        color: var(--text-4);
      }

      .rm-notes-section-title__count {
        font-variant-numeric: tabular-nums;
      }

      @media (max-width: 768px) {
        .rm-notes-section-title {
          gap: 2px;
          font-size: 13px;
          line-height: 1.25;
        }

        .rm-notes-question-text {
          font-size: 15px !important;
          line-height: 1.58 !important;
        }

        .rm-notes-oneliner-grid {
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .rm-notes-oneliner-card {
          min-height: 0;
          padding: 20px 18px;
        }

        .rm-notes-oneliner-card__quote {
          padding-left: 22px;
          font-size: 15px;
          line-height: 1.48;
        }

        .rm-notes-oneliner-card__quote::before {
          width: 2px;
          min-height: 24px;
        }

        .rm-notes-oneliner-card .row {
          padding-left: 22px !important;
        }

        .rm-notes-highlight-row {
          padding: 20px 0 22px;
        }

        .rm-notes-highlight-row__quote {
          padding-left: 22px;
          font-size: 16px;
          line-height: 1.48;
        }

        .rm-notes-highlight-row__quote::before {
          width: 2px;
        }

        .rm-notes-highlight-row .row {
          padding-left: 22px !important;
        }

        .rm-notes-excerpt-row .quote {
          border-bottom: 0;
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
  rightLabel?: string;
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
      {rightLabel ? (
        <span className="tiny mono" style={{ marginLeft: "auto" }}>
          {rightLabel}
        </span>
      ) : null}
    </div>
  );
}
