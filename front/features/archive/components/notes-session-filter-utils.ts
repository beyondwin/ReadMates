import type { NoteSessionItem } from "@/shared/api/readmates";

export function noteSessionNumberLabel(session: NoteSessionItem) {
  return `No.${String(session.sessionNumber).padStart(2, "0")}`;
}

export function sessionBookTitle(session: NoteSessionItem) {
  return session.bookTitle || noteSessionNumberLabel(session);
}

export function resolveSelectedSession({
  noteSessions,
  selectedSessionId,
  selectedSession,
}: {
  noteSessions: NoteSessionItem[];
  selectedSessionId: string | null;
  selectedSession: NoteSessionItem | null;
}) {
  if (selectedSession) {
    return selectedSession;
  }

  if (selectedSessionId) {
    const matchingSession = noteSessions.find((session) => session.sessionId === selectedSessionId);

    if (matchingSession) {
      return matchingSession;
    }
  }

  return noteSessions.find((session) => session.totalCount > 0) ?? noteSessions[0] ?? null;
}
