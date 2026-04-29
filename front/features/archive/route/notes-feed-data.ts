import type { LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router-dom";
import { fetchNoteSessions, fetchNotesFeed } from "@/features/archive/api/archive-api";
import type { NoteFeedItem, NoteSessionItem } from "@/features/archive/api/archive-contracts";
import { selectNoteSession } from "@/features/archive/model/notes-feed-model";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import type { ReadmatesApiContext } from "@/shared/api/client";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export type NotesFeedRouteData = {
  noteSessions: NoteSessionItem[];
  selectedSession: NoteSessionItem | null;
  items: NoteFeedItem[];
};

export async function loadNotesFeedRouteData(requestedSessionId: string | null, context?: ReadmatesApiContext): Promise<NotesFeedRouteData> {
  const noteSessions = await fetchNoteSessions(context);
  const selectedSession = selectNoteSession(noteSessions, requestedSessionId);
  const items = selectedSession ? await fetchNotesFeed(selectedSession.sessionId, context) : [];

  return { noteSessions, selectedSession, items };
}

export async function notesFeedLoader({ params, request }: LoaderFunctionArgs): Promise<NotesFeedRouteData> {
  const access = await loadArchiveMemberAuth({ params });

  if (!access.allowed) {
    return { noteSessions: [], selectedSession: null, items: [] };
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
