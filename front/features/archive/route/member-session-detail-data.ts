import type { LoaderFunctionArgs } from "react-router-dom";
import { fetchMemberArchiveSession, fetchNotesFeed } from "@/features/archive/api/archive-api";
import type {
  MemberArchiveSessionDetailResponse,
  NoteFeedItem,
} from "@/features/archive/api/archive-contracts";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export type MemberSessionDetailRouteData = Awaited<ReturnType<typeof fetchMemberArchiveSession>>;

export function enrichSessionDetailHighlightAuthors(
  session: MemberArchiveSessionDetailResponse,
  notesFeed: NoteFeedItem[],
): MemberArchiveSessionDetailResponse {
  const highlightAuthorsByText = new Map(
    notesFeed
      .filter((item) => item.kind === "HIGHLIGHT" && item.authorName)
      .map((item) => [item.text, item]),
  );

  return {
    ...session,
    publicHighlights: session.publicHighlights.map((highlight) => {
      if (highlight.authorName) {
        return highlight;
      }

      const note = highlightAuthorsByText.get(highlight.text);

      if (!note) {
        return highlight;
      }

      return {
        ...highlight,
        authorName: note.authorName,
        authorShortName: note.authorShortName,
      };
    }),
  };
}

export async function memberSessionDetailLoader(args: LoaderFunctionArgs): Promise<MemberSessionDetailRouteData> {
  const { params } = args;
  const access = await loadArchiveMemberAuth(args);
  const context = { clubSlug: clubSlugFromLoaderArgs({ params }) };

  if (!access.allowed) {
    return null;
  }

  if (!params.sessionId) {
    return null;
  }

  const session = await fetchMemberArchiveSession(params.sessionId, context);

  if (!session || session.publicHighlights.every((highlight) => highlight.authorName)) {
    return session;
  }

  try {
    const notesFeed = await fetchNotesFeed(session.sessionId, context, { limit: 60 });
    return enrichSessionDetailHighlightAuthors(session, notesFeed.items);
  } catch {
    return session;
  }
}
