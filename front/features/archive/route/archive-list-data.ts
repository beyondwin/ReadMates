import {
  fetchArchiveSessions,
  fetchMyArchiveQuestions,
  fetchMyArchiveReviews,
  fetchMyFeedbackDocuments,
} from "@/features/archive/api/archive-api";
import type {
  ArchiveSessionPage,
  FeedbackDocumentListPage,
  MyArchiveQuestionPage,
  MyArchiveReviewPage,
} from "@/features/archive/api/archive-contracts";
import type { LoaderFunctionArgs } from "react-router-dom";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export type ArchiveListRouteData = {
  sessions: ArchiveSessionPage;
  questions: MyArchiveQuestionPage;
  reviews: MyArchiveReviewPage;
  reports: FeedbackDocumentListPage;
};

const ARCHIVE_FIRST_PAGE_LIMIT = 30;

function emptyPage<T>() {
  return { items: [] as T[], nextCursor: null };
}

export async function archiveListLoader(args?: LoaderFunctionArgs): Promise<ArchiveListRouteData> {
  const access = await loadArchiveMemberAuth(args);
  const context = { clubSlug: clubSlugFromLoaderArgs(args) };

  if (!access.allowed) {
    return {
      sessions: emptyPage(),
      questions: emptyPage(),
      reviews: emptyPage(),
      reports: emptyPage(),
    };
  }

  const [sessions, questions, reviews, reports] = await Promise.all([
    fetchArchiveSessions(context, { limit: ARCHIVE_FIRST_PAGE_LIMIT }),
    fetchMyArchiveQuestions(context, { limit: ARCHIVE_FIRST_PAGE_LIMIT }),
    fetchMyArchiveReviews(context, { limit: ARCHIVE_FIRST_PAGE_LIMIT }),
    fetchMyFeedbackDocuments(context, { limit: ARCHIVE_FIRST_PAGE_LIMIT }),
  ]);

  return { sessions, questions, reviews, reports };
}
