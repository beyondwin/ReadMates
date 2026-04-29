import {
  fetchArchiveSessions,
  fetchMyArchiveQuestions,
  fetchMyArchiveReviews,
  fetchMyFeedbackDocuments,
} from "@/features/archive/api/archive-api";
import type {
  ArchiveSessionItem,
  FeedbackDocumentListItem,
  MyArchiveQuestionItem,
  MyArchiveReviewItem,
} from "@/features/archive/api/archive-contracts";
import type { LoaderFunctionArgs } from "react-router-dom";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export type ArchiveListRouteData = {
  sessions: ArchiveSessionItem[];
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
  reports: FeedbackDocumentListItem[];
};

export async function archiveListLoader(args?: LoaderFunctionArgs): Promise<ArchiveListRouteData> {
  const access = await loadArchiveMemberAuth(args);
  const context = { clubSlug: clubSlugFromLoaderArgs(args) };

  if (!access.allowed) {
    return { sessions: [], questions: [], reviews: [], reports: [] };
  }

  const [sessions, questions, reviews, reports] = await Promise.all([
    fetchArchiveSessions(context),
    fetchMyArchiveQuestions(context),
    fetchMyArchiveReviews(context),
    fetchMyFeedbackDocuments(context),
  ]);

  return { sessions, questions, reviews, reports };
}
