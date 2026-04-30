import type { LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router-dom";
import { fetchNoteSessions, fetchNotesFeed } from "@/features/archive/api/archive-api";
import type { NoteFeedPage, NoteSessionItem, NoteSessionPage } from "@/features/archive/api/archive-contracts";
import { selectNoteSession } from "@/features/archive/model/notes-feed-model";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import type { ReadmatesApiContext } from "@/shared/api/client";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export type NotesFeedRouteData = {
  noteSessions: NoteSessionPage;
  selectedSessionId: string | null;
  selectedSession: NoteSessionItem | null;
  items: NoteFeedPage;
};

const NOTES_SESSIONS_FIRST_PAGE_LIMIT = 30;
const NOTES_FEED_FIRST_PAGE_LIMIT = 60;

function emptyPage<T>() {
  return { items: [] as T[], nextCursor: null };
}

function requestedSessionIdOrNull(requestedSessionId: string | null) {
  return requestedSessionId?.trim() ? requestedSessionId : null;
}

function noteSessionFromFeedItems(requestedSessionId: string, items: NoteFeedPage["items"]): NoteSessionItem | null {
  const sessionItems = items.filter((item) => item.sessionId === requestedSessionId);
  const firstItem = sessionItems[0];

  if (!firstItem) {
    return null;
  }

  return {
    sessionId: requestedSessionId,
    sessionNumber: firstItem.sessionNumber,
    bookTitle: firstItem.bookTitle,
    date: firstItem.date,
    questionCount: sessionItems.filter((item) => item.kind === "QUESTION").length,
    oneLinerCount: sessionItems.filter((item) => item.kind === "ONE_LINE_REVIEW").length,
    longReviewCount: sessionItems.filter((item) => item.kind === "LONG_REVIEW").length,
    highlightCount: sessionItems.filter((item) => item.kind === "HIGHLIGHT").length,
    totalCount: sessionItems.length,
  };
}

export async function loadNotesFeedRouteData(requestedSessionId: string | null, context?: ReadmatesApiContext): Promise<NotesFeedRouteData> {
  const noteSessions = await fetchNoteSessions(context, { limit: NOTES_SESSIONS_FIRST_PAGE_LIMIT });
  const requestedSessionIdValue = requestedSessionIdOrNull(requestedSessionId);

  if (requestedSessionIdValue) {
    const selectedSession = noteSessions.items.find((session) => session.sessionId === requestedSessionIdValue) ?? null;

    if (!selectedSession) {
      const items = await fetchNotesFeed(requestedSessionIdValue, context, { limit: NOTES_FEED_FIRST_PAGE_LIMIT });

      return {
        noteSessions,
        selectedSessionId: requestedSessionIdValue,
        selectedSession: noteSessionFromFeedItems(requestedSessionIdValue, items.items),
        items,
      };
    }

    const items = await fetchNotesFeed(selectedSession.sessionId, context, { limit: NOTES_FEED_FIRST_PAGE_LIMIT });

    return { noteSessions, selectedSessionId: requestedSessionIdValue, selectedSession, items };
  }

  const selectedSession = selectNoteSession(noteSessions.items, requestedSessionIdValue);
  const items = selectedSession ? await fetchNotesFeed(selectedSession.sessionId, context, { limit: NOTES_FEED_FIRST_PAGE_LIMIT }) : emptyPage();

  return { noteSessions, selectedSessionId: selectedSession?.sessionId ?? null, selectedSession, items };
}

export async function notesFeedLoader(args: LoaderFunctionArgs): Promise<NotesFeedRouteData> {
  const { params, request } = args;
  const access = await loadArchiveMemberAuth(args);

  if (!access.allowed) {
    return { noteSessions: emptyPage(), selectedSessionId: null, selectedSession: null, items: emptyPage() };
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
