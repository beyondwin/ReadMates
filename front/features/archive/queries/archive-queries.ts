import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import {
  fetchArchiveSessions,
  fetchMemberArchiveSession,
  fetchMyArchiveQuestions,
  fetchMyArchiveReviews,
  fetchMyFeedbackDocuments,
  fetchNotesFeed,
} from "@/features/archive/api/archive-api";
import type {
  ArchiveSessionPage,
  FeedbackDocumentListPage,
  MemberArchiveSessionDetailResponse,
  MyArchiveQuestionPage,
  MyArchiveReviewPage,
  NoteFeedItem,
} from "@/features/archive/api/archive-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import {
  combineCursorPages,
  normalizePageRequest,
  pageFromNormalizedPageRequest,
} from "@/shared/query/cursor-pagination";

export const ARCHIVE_FIRST_PAGE_LIMIT = 30;
export const ARCHIVE_NEXT_PAGE_LIMIT = 30;

export type ArchiveListQueryData = {
  sessions: ArchiveSessionPage;
  questions: MyArchiveQuestionPage;
  reviews: MyArchiveReviewPage;
  reports: FeedbackDocumentListPage;
};

function scopeKey(context?: ReadmatesApiContext): string | null {
  return context?.clubSlug ?? null;
}

function emptyPage<T>() {
  return { items: [] as T[], nextCursor: null };
}

export function emptyArchiveListQueryData(): ArchiveListQueryData {
  return {
    sessions: emptyPage(),
    questions: emptyPage(),
    reviews: emptyPage(),
    reports: emptyPage(),
  };
}

export const archiveKeys = {
  all: ["archive"] as const,
  scope: (context?: ReadmatesApiContext) => [...archiveKeys.all, "scope", scopeKey(context)] as const,
  listRoot: (context?: ReadmatesApiContext) => [...archiveKeys.scope(context), "list"] as const,
  list: (context?: ReadmatesApiContext, page?: PageRequest) =>
    [...archiveKeys.listRoot(context), normalizePageRequest(page)] as const,
  detail: (sessionId: string, context?: ReadmatesApiContext) =>
    [...archiveKeys.scope(context), "detail", sessionId] as const,
} as const;

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

export async function fetchArchiveListQueryData(
  context?: ReadmatesApiContext,
  page: PageRequest = { limit: ARCHIVE_FIRST_PAGE_LIMIT },
): Promise<ArchiveListQueryData> {
  const [sessions, questions, reviews, reports] = await Promise.all([
    fetchArchiveSessions(context, page),
    fetchMyArchiveQuestions(context, page),
    fetchMyArchiveReviews(context, page),
    fetchMyFeedbackDocuments(context, page),
  ]);

  return { sessions, questions, reviews, reports };
}

export async function fetchMemberArchiveSessionQueryData(
  sessionId: string,
  context?: ReadmatesApiContext,
): Promise<MemberArchiveSessionDetailResponse | null> {
  const session = await fetchMemberArchiveSession(sessionId, context);

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

export function archiveListQuery(context?: ReadmatesApiContext, page?: PageRequest) {
  const normalized = normalizePageRequest(page);

  return queryOptions<ArchiveListQueryData>({
    queryKey: archiveKeys.list(context, page),
    queryFn: () => fetchArchiveListQueryData(context, pageFromNormalizedPageRequest(normalized) ?? { limit: ARCHIVE_FIRST_PAGE_LIMIT }),
  });
}

export function memberArchiveSessionQuery(sessionId: string, context?: ReadmatesApiContext) {
  return queryOptions<MemberArchiveSessionDetailResponse | null>({
    queryKey: archiveKeys.detail(sessionId, context),
    queryFn: () => fetchMemberArchiveSessionQueryData(sessionId, context),
  });
}

export function combineArchiveListPages(pages: ArchiveListQueryData[]): ArchiveListQueryData {
  return {
    sessions: combineCursorPages(pages.map((page) => page.sessions)),
    questions: combineCursorPages(pages.map((page) => page.questions)),
    reviews: combineCursorPages(pages.map((page) => page.reviews)),
    reports: combineCursorPages(pages.map((page) => page.reports)),
  };
}

export function invalidateArchiveQueries(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: archiveKeys.scope(context) });
}
