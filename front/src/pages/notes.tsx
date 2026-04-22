import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import NotesFeedPage from "@/features/archive/components/notes-feed-page";
import type { NoteFeedItem, NoteSessionItem } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

function selectNoteSession(noteSessions: NoteSessionItem[], requestedSessionId: string | null) {
  if (requestedSessionId) {
    const requestedSession = noteSessions.find((session) => session.sessionId === requestedSessionId);

    if (requestedSession) {
      return requestedSession;
    }
  }

  return noteSessions.find((session) => session.totalCount > 0) ?? noteSessions[0] ?? null;
}

export default function NotesPage() {
  const [searchParams] = useSearchParams();
  const requestedSessionId = searchParams.get("sessionId");
  const state = useReadmatesData(
    useCallback(async () => {
      const noteSessions = await readmatesFetch<NoteSessionItem[]>("/api/notes/sessions");
      const selectedSession = selectNoteSession(noteSessions, requestedSessionId);
      const items = selectedSession
        ? await readmatesFetch<NoteFeedItem[]>(`/api/notes/feed?sessionId=${encodeURIComponent(selectedSession.sessionId)}`)
        : [];

      return { noteSessions, selectedSession, items };
    }, [requestedSessionId]),
  );

  return (
    <ReadmatesPageState state={state}>
      {(data) => (
        <NotesFeedPage
          items={data.items}
          noteSessions={data.noteSessions}
          selectedSessionId={data.selectedSession?.sessionId ?? null}
          selectedSession={data.selectedSession}
        />
      )}
    </ReadmatesPageState>
  );
}
