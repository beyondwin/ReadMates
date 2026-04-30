import type { LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router-dom";
import { fetchNoteSessions, fetchNotesFeed } from "@/features/archive/api/archive-api";
import type { NoteFeedPage, NoteSessionItem, NoteSessionPage } from "@/features/archive/api/archive-contracts";
import { selectNoteSession } from "@/features/archive/model/notes-feed-model";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import type { ReadmatesApiContext } from "@/shared/api/client";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export type NotesFeedRouteData = {
  noteSessions: NoteSessionPage;
  selectedSession: NoteSessionItem | null;
  items: NoteFeedPage;
};

const NOTES_SESSIONS_FIRST_PAGE_LIMIT = 30;
const NOTES_FEED_FIRST_PAGE_LIMIT = 60;

function emptyPage<T>() {
  return { items: [] as T[], nextCursor: null };
}

export async function loadNotesFeedRouteData(requestedSessionId: string | null, context?: ReadmatesApiContext): Promise<NotesFeedRouteData> {
  const noteSessions = await fetchNoteSessions(context, { limit: NOTES_SESSIONS_FIRST_PAGE_LIMIT });
  const selectedSession = selectNoteSession(noteSessions.items, requestedSessionId);
  const items = selectedSession ? await fetchNotesFeed(selectedSession.sessionId, context, { limit: NOTES_FEED_FIRST_PAGE_LIMIT }) : emptyPage();

  return { noteSessions, selectedSession, items };
}

export async function notesFeedLoader({ params, request }: LoaderFunctionArgs): Promise<NotesFeedRouteData> {
  const access = await loadArchiveMemberAuth({ params });

  if (!access.allowed) {
    return { noteSessions: emptyPage(), selectedSession: null, items: emptyPage() };
  }

  const url = new URL(request.url);

  return loadNotesFeedRouteData(url.searchParams.get("sessionId"), { clubSlug: clubSlugFromLoaderArgs({ params }) });
}

export function notesFeedShouldRevalidate({
  currentUrl,
  nextUrl,
}: ShouldRevalidateFunctionArgs) {
  return currentUrl.searchParams.get("sessionId") !== nextUrl.searchParams.get("sessionId");
}
