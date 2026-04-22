import type { LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router-dom";
import { fetchNoteSessions, fetchNotesFeed } from "@/features/archive/api/archive-api";
import type { NoteFeedItem, NoteSessionItem } from "@/features/archive/api/archive-contracts";
import { selectNoteSession } from "@/features/archive/model/notes-feed-model";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";

export type NotesFeedRouteData = {
  noteSessions: NoteSessionItem[];
  selectedSession: NoteSessionItem | null;
  items: NoteFeedItem[];
};

export async function loadNotesFeedRouteData(requestedSessionId: string | null): Promise<NotesFeedRouteData> {
  const noteSessions = await fetchNoteSessions();
  const selectedSession = selectNoteSession(noteSessions, requestedSessionId);
  const items = selectedSession ? await fetchNotesFeed(selectedSession.sessionId) : [];

  return { noteSessions, selectedSession, items };
}

export async function notesFeedLoader({ request }: LoaderFunctionArgs): Promise<NotesFeedRouteData> {
  const access = await loadArchiveMemberAuth();

  if (!access.allowed) {
    return { noteSessions: [], selectedSession: null, items: [] };
  }

  const url = new URL(request.url);

  return loadNotesFeedRouteData(url.searchParams.get("sessionId"));
}

export function notesFeedShouldRevalidate({
  currentUrl,
  nextUrl,
}: ShouldRevalidateFunctionArgs) {
  return currentUrl.searchParams.get("sessionId") !== nextUrl.searchParams.get("sessionId");
}
