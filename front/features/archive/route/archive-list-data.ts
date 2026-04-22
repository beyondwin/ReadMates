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
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";

export type ArchiveListRouteData = {
  sessions: ArchiveSessionItem[];
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
  reports: FeedbackDocumentListItem[];
};

export async function archiveListLoader(): Promise<ArchiveListRouteData> {
  const access = await loadArchiveMemberAuth();

  if (!access.allowed) {
    return { sessions: [], questions: [], reviews: [], reports: [] };
  }

  const [sessions, questions, reviews, reports] = await Promise.all([
    fetchArchiveSessions(),
    fetchMyArchiveQuestions(),
    fetchMyArchiveReviews(),
    fetchMyFeedbackDocuments(),
  ]);

  return { sessions, questions, reviews, reports };
}
