"use client";

import { type CSSProperties, useRef, useState } from "react";
import type { FeedFilter, NoteFeedItem, NoteSessionItem } from "@/features/archive/model/notes-feed-model";
import { resolveSelectedSession } from "@/features/archive/model/notes-feed-model";
import { FeedSections, NotesFilterBar } from "@/features/archive/ui/notes-feed-list";
import {
  MobileSessionPicker,
  MobileSessionSheet,
  SelectedSessionHeader,
  SessionRail,
} from "@/features/archive/ui/notes-session-filter";
import type { PagedResponse } from "@/shared/model/paging";

type LoadMoreCallback = () => Promise<void>;

export default function NotesFeedPage({
  items,
  noteSessions,
  selectedSessionId,
  selectedSession,
  initialFilter = "all",
  onFilterChange,
  onLoadMoreItems,
  onLoadMoreNoteSessions,
}: {
  items: PagedResponse<NoteFeedItem>;
  noteSessions: PagedResponse<NoteSessionItem>;
  selectedSessionId: string | null;
  selectedSession: NoteSessionItem | null;
  initialFilter?: FeedFilter;
  onFilterChange?: (filter: FeedFilter) => void;
  onLoadMoreItems?: LoadMoreCallback;
  onLoadMoreNoteSessions?: LoadMoreCallback;
}) {
  const [fallbackFilter, setFallbackFilter] = useState<FeedFilter>(initialFilter);
  const [sessionQuery, setSessionQuery] = useState("");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSessionQuery, setMobileSessionQuery] = useState("");
  const mobileAllSessionsButtonRef = useRef<HTMLButtonElement>(null);
  const noteSessionItems = noteSessions.items;
  const feedItems = items.items;
  const displayedSession = resolveSelectedSession({ noteSessions: noteSessionItems, selectedSessionId, selectedSession });
  const activeSessionId = displayedSession?.sessionId ?? null;
  const selectedSessionItems = activeSessionId ? feedItems.filter((item) => item.sessionId === activeSessionId) : [];
  const filter = onFilterChange ? initialFilter : fallbackFilter;
  const handleFilterChange = (nextFilter: FeedFilter) => {
    if (onFilterChange) {
      onFilterChange(nextFilter);
      return;
    }

    setFallbackFilter(nextFilter);
  };

  return (
    <main className="rm-notes-feed-page">
      <style>{`
        .rm-notes-feed-page__layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 280px;
          gap: 56px;
          align-items: start;
        }

        .rm-notes-feed-page__header {
          padding-bottom: 0;
        }

        .rm-notes-feed-page__body {
          padding: 28px 0 80px;
        }

        .rm-notes-feed-page__mobile-picker {
          margin-top: 18px;
        }

        @media (max-width: 768px) {
          .rm-notes-feed-page .page-header-compact.rm-notes-feed-page__header {
            padding: 24px 0 0;
          }

          .rm-notes-feed-page__layout {
            display: block;
          }

          .rm-notes-feed-page__body {
            padding: 28px 0 80px;
          }
        }
      `}</style>

      <section className="page-header-compact rm-notes-feed-page__header">
        <div className="container">
          <SelectedSessionHeader session={displayedSession} />
          <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 0", maxWidth: 620 }}>
            세션을 먼저 고르고, 하이라이트·한줄평·질문을 작성자와 함께 훑는 클럽 기록장입니다.
          </p>
          <NotesFilterBar filter={filter} onFilterChange={handleFilterChange} selectedSession={displayedSession} />
          <MobileSessionPicker
            noteSessions={noteSessionItems}
            selectedSessionId={activeSessionId}
            filter={filter}
            onOpenAll={() => setMobileSheetOpen(true)}
            allSessionsButtonRef={mobileAllSessionsButtonRef}
          />
          <div className="mobile-only rm-notes-feed-page__mobile-more">
            <LoadMoreButton visible={Boolean(noteSessions.nextCursor)} onLoadMore={onLoadMoreNoteSessions} />
          </div>
        </div>
      </section>

      <section className="rm-notes-feed-page__body">
        <div className="container">
          <div className="rm-notes-feed-page__layout">
            <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
              <FeedSections items={selectedSessionItems} filter={filter} selectedSession={displayedSession} hasNoteSessions={noteSessionItems.length > 0} />
              <LoadMoreButton visible={Boolean(items.nextCursor)} onLoadMore={onLoadMoreItems} />
            </div>
            <aside className="desktop-only">
              <SessionRail
                noteSessions={noteSessionItems}
                selectedSessionId={activeSessionId}
                filter={filter}
                query={sessionQuery}
                onQueryChange={setSessionQuery}
              />
              <LoadMoreButton visible={Boolean(noteSessions.nextCursor)} onLoadMore={onLoadMoreNoteSessions} />
            </aside>
          </div>
        </div>
      </section>

      {mobileSheetOpen ? (
        <MobileSessionSheet
          noteSessions={noteSessionItems}
          selectedSessionId={activeSessionId}
          filter={filter}
          query={mobileSessionQuery}
          onQueryChange={setMobileSessionQuery}
          onClose={() => setMobileSheetOpen(false)}
          restoreFocusRef={mobileAllSessionsButtonRef}
        />
      ) : null}
    </main>
  );
}

function LoadMoreButton({ visible, onLoadMore }: { visible: boolean; onLoadMore?: LoadMoreCallback }) {
  const [pending, setPending] = useState(false);

  if (!visible || !onLoadMore) {
    return null;
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: "20px" }}>
      <button
        type="button"
        className="btn btn-quiet"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await onLoadMore();
          } finally {
            setPending(false);
          }
        }}
      >
        더 보기
      </button>
    </div>
  );
}
