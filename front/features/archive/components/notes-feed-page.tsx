"use client";

import { type CSSProperties, useRef, useState } from "react";
import { FeedSections, type FeedFilter, NotesFilterBar } from "@/features/archive/components/notes-feed-list";
import {
  MobileSessionPicker,
  MobileSessionSheet,
  SelectedSessionHeader,
  SessionRail,
} from "@/features/archive/components/notes-session-filter";
import { resolveSelectedSession } from "@/features/archive/components/notes-session-filter-utils";
import type { NoteFeedItem, NoteSessionItem } from "@/shared/api/readmates";

export default function NotesFeedPage({
  items,
  noteSessions,
  selectedSessionId,
  selectedSession,
}: {
  items: NoteFeedItem[];
  noteSessions: NoteSessionItem[];
  selectedSessionId: string | null;
  selectedSession: NoteSessionItem | null;
}) {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [sessionQuery, setSessionQuery] = useState("");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSessionQuery, setMobileSessionQuery] = useState("");
  const mobileAllSessionsButtonRef = useRef<HTMLButtonElement>(null);
  const displayedSession = resolveSelectedSession({ noteSessions, selectedSessionId, selectedSession });
  const activeSessionId = displayedSession?.sessionId ?? null;
  const selectedSessionItems = activeSessionId ? items.filter((item) => item.sessionId === activeSessionId) : [];

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
          <NotesFilterBar filter={filter} onFilterChange={setFilter} />
          <MobileSessionPicker
            noteSessions={noteSessions}
            selectedSessionId={activeSessionId}
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
          query={mobileSessionQuery}
          onQueryChange={setMobileSessionQuery}
          onClose={() => setMobileSheetOpen(false)}
          restoreFocusRef={mobileAllSessionsButtonRef}
        />
      ) : null}
    </main>
  );
}
