import {
  fetchMyArchiveQuestions,
  fetchMyArchiveReviews,
  fetchMyFeedbackDocuments,
  fetchMyPage,
} from "@/features/archive/api/archive-api";
import type { FeedbackDocumentListItem, MyPageResponse } from "@/features/archive/api/archive-contracts";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import type { AuthMeResponse } from "@/shared/api/readmates";

export type MyPageRouteData = {
  data: MyPageResponse;
  reports: FeedbackDocumentListItem[];
  questionCount: number;
  reviewCount: number;
};

function inactiveMyPageData(auth: AuthMeResponse): MyPageResponse {
  return {
    displayName: auth.displayName ?? "",
    shortName: auth.shortName ?? "",
    email: auth.email ?? "",
    role: auth.role ?? "MEMBER",
    membershipStatus: auth.membershipStatus ?? "INACTIVE",
    clubName: null,
    joinedAt: "",
    sessionCount: 0,
    totalSessionCount: 0,
    recentAttendances: [],
  };
}

export async function myPageLoader(): Promise<MyPageRouteData> {
  const access = await loadArchiveMemberAuth();

  if (!access.allowed) {
    return { data: inactiveMyPageData(access.auth), reports: [], questionCount: 0, reviewCount: 0 };
  }

  const [data, reports, questions, reviews] = await Promise.all([
    fetchMyPage(),
    fetchMyFeedbackDocuments(),
    fetchMyArchiveQuestions(),
    fetchMyArchiveReviews(),
  ]);

  return { data, reports, questionCount: questions.length, reviewCount: reviews.length };
}
