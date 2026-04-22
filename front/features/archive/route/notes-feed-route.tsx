import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { loadNotesFeedRouteData } from "@/features/archive/api/archive-api";
import { feedFilterFromSearchParam, type FeedFilter } from "@/features/archive/model/notes-feed-model";
import NotesFeedPage from "@/features/archive/ui/notes-feed-page";
import { useArchiveRouteData } from "@/features/archive/route/archive-route-data-state";
import { ArchiveRouteState } from "@/features/archive/route/archive-route-state";

export function NotesFeedRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSessionId = searchParams.get("sessionId");
  const initialFilter = feedFilterFromSearchParam(searchParams.get("filter"));
  const handleFilterChange = useCallback(
    (filter: FeedFilter) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);

          if (filter === "all") {
            next.delete("filter");
          } else {
            next.set("filter", filter);
          }

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const state = useArchiveRouteData(
    useCallback(() => loadNotesFeedRouteData(requestedSessionId), [requestedSessionId]),
  );

  return (
    <ArchiveRouteState state={state} loadingLabel="클럽 노트를 불러오는 중">
      {(data) => (
        <NotesFeedPage
          items={data.items}
          noteSessions={data.noteSessions}
          selectedSessionId={data.selectedSession?.sessionId ?? null}
          selectedSession={data.selectedSession}
          initialFilter={initialFilter}
          onFilterChange={handleFilterChange}
        />
      )}
    </ArchiveRouteState>
  );
}
