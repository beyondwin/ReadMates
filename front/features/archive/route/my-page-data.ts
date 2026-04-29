import {
  fetchNotificationPreferences,
  fetchMyArchiveQuestions,
  fetchMyArchiveReviews,
  fetchMyFeedbackDocuments,
  fetchMyPage,
} from "@/features/archive/api/archive-api";
import type {
  FeedbackDocumentListItem,
  MyPageResponse,
  NotificationPreferencesResponse,
} from "@/features/archive/api/archive-contracts";
import { defaultNotificationPreferences } from "@/features/archive/model/archive-model";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

export type MyPageRouteData = {
  data: MyPageResponse;
  reports: FeedbackDocumentListItem[];
  questionCount: number;
  reviewCount: number;
  notificationPreferences: NotificationPreferencesResponse;
};

function inactiveMyPageData(auth: AuthMeResponse): MyPageResponse {
  return {
    displayName: auth.displayName ?? "",
    accountName: auth.accountName ?? "",
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
    return {
      data: inactiveMyPageData(access.auth),
      reports: [],
      questionCount: 0,
      reviewCount: 0,
      notificationPreferences: defaultNotificationPreferences,
    };
  }

  const [data, reports, questions, reviews, notificationPreferences] = await Promise.all([
    fetchMyPage(),
    fetchMyFeedbackDocuments(),
    fetchMyArchiveQuestions(),
    fetchMyArchiveReviews(),
    fetchNotificationPreferences(),
  ]);

  return { data, reports, questionCount: questions.length, reviewCount: reviews.length, notificationPreferences };
}
