import { useCallback } from "react";
import { useLoaderData, useSearchParams } from "react-router-dom";
import type { NotesFeedRouteData } from "@/features/archive/api/archive-api";
import { feedFilterFromSearchParam, type FeedFilter } from "@/features/archive/model/notes-feed-model";
import NotesFeedPage from "@/features/archive/ui/notes-feed-page";

export function NotesFeedRoute() {
  const data = useLoaderData() as NotesFeedRouteData;
  const [searchParams, setSearchParams] = useSearchParams();
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

  return (
    <NotesFeedPage
      items={data.items}
      noteSessions={data.noteSessions}
      selectedSessionId={data.selectedSession?.sessionId ?? null}
      selectedSession={data.selectedSession}
      initialFilter={initialFilter}
      onFilterChange={handleFilterChange}
    />
  );
}
