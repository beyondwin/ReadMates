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

export default function NotesFeedPage({
  items,
  noteSessions,
  selectedSessionId,
  selectedSession,
  initialFilter = "all",
  onFilterChange,
}: {
  items: NoteFeedItem[];
  noteSessions: NoteSessionItem[];
  selectedSessionId: string | null;
  selectedSession: NoteSessionItem | null;
  initialFilter?: FeedFilter;
  onFilterChange?: (filter: FeedFilter) => void;
}) {
  const [fallbackFilter, setFallbackFilter] = useState<FeedFilter>(initialFilter);
  const [sessionQuery, setSessionQuery] = useState("");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSessionQuery, setMobileSessionQuery] = useState("");
  const mobileAllSessionsButtonRef = useRef<HTMLButtonElement>(null);
  const displayedSession = resolveSelectedSession({ noteSessions, selectedSessionId, selectedSession });
  const activeSessionId = displayedSession?.sessionId ?? null;
  const selectedSessionItems = activeSessionId ? items.filter((item) => item.sessionId === activeSessionId) : [];
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
          grid-template-columns: minmax(0, 1fr) 300px;
          gap: 56px;
          align-items: start;
        }

        .rm-notes-feed-page__body {
          padding: 40px 0 80px;
        }

        .rm-notes-feed-page__mobile-picker {
          margin-top: 18px;
        }

        @media (max-width: 768px) {
          .rm-notes-feed-page .page-header-compact {
            padding: 16px 0 18px;
          }

          .rm-notes-feed-page__layout {
            display: block;
          }

          .rm-notes-feed-page__body {
            padding: 24px 0 80px;
          }
        }
      `}</style>

      <section className="page-header-compact">
        <div className="container">
          <SelectedSessionHeader session={displayedSession} />
          <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 0", maxWidth: 620 }}>
            세션을 먼저 고르고, 질문·서평·하이라이트를 작성자와 함께 훑는 클럽 기록장입니다.
          </p>
          <NotesFilterBar filter={filter} onFilterChange={handleFilterChange} />
          <MobileSessionPicker
            noteSessions={noteSessions}
            selectedSessionId={activeSessionId}
            filter={filter}
            onOpenAll={() => setMobileSheetOpen(true)}
            allSessionsButtonRef={mobileAllSessionsButtonRef}
          />
        </div>
      </section>

      <section className="rm-notes-feed-page__body">
        <div className="container">
          <div className="rm-notes-feed-page__layout">
            <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
              <FeedSections items={selectedSessionItems} filter={filter} selectedSession={displayedSession} hasNoteSessions={noteSessions.length > 0} />
            </div>
            <aside className="desktop-only">
              <SessionRail
                noteSessions={noteSessions}
                selectedSessionId={activeSessionId}
                filter={filter}
                query={sessionQuery}
                onQueryChange={setSessionQuery}
              />
            </aside>
          </div>
        </div>
      </section>

      {mobileSheetOpen ? (
        <MobileSessionSheet
          noteSessions={noteSessions}
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
