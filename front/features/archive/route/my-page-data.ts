import {
  fetchNotificationPreferences,
  fetchMyArchiveQuestions,
  fetchMyArchiveReviews,
  fetchMyFeedbackDocuments,
  fetchMyPage,
} from "@/features/archive/api/archive-api";
import type {
  FeedbackDocumentListPage,
  MyArchiveQuestionPage,
  MyArchiveReviewPage,
  MyPageResponse,
  NotificationPreferencesResponse,
} from "@/features/archive/api/archive-contracts";
import { defaultNotificationPreferences } from "@/features/archive/model/archive-model";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import type { LoaderFunctionArgs } from "react-router-dom";

export type MyPageRouteData = {
  data: MyPageResponse;
  reports: FeedbackDocumentListPage;
  questions: MyArchiveQuestionPage;
  reviews: MyArchiveReviewPage;
  questionCount: number;
  reviewCount: number;
  notificationPreferences: NotificationPreferencesResponse;
  canManageNotificationPreferences: boolean;
};

const MY_PAGE_FIRST_PAGE_LIMIT = 30;

function emptyPage<T>() {
  return { items: [] as T[], nextCursor: null };
}

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

function canManageNotificationPreferences(auth: AuthMeResponse) {
  return auth.membershipStatus !== "VIEWER";
}

export async function myPageLoader(args?: LoaderFunctionArgs): Promise<MyPageRouteData> {
  const access = await loadArchiveMemberAuth(args);
  const context = { clubSlug: clubSlugFromLoaderArgs(args) };
  const notificationPreferencesAvailable = access.allowed && canManageNotificationPreferences(access.auth);

  if (!access.allowed) {
    return {
      data: inactiveMyPageData(access.auth),
      reports: emptyPage(),
      questions: emptyPage(),
      reviews: emptyPage(),
      questionCount: 0,
      reviewCount: 0,
      notificationPreferences: defaultNotificationPreferences,
      canManageNotificationPreferences: false,
    };
  }

  const [data, reports, questions, reviews, notificationPreferences] = await Promise.all([
    fetchMyPage(context),
    fetchMyFeedbackDocuments(context, { limit: MY_PAGE_FIRST_PAGE_LIMIT }),
    fetchMyArchiveQuestions(context, { limit: MY_PAGE_FIRST_PAGE_LIMIT }),
    fetchMyArchiveReviews(context, { limit: MY_PAGE_FIRST_PAGE_LIMIT }),
    notificationPreferencesAvailable ? fetchNotificationPreferences(context) : Promise.resolve(defaultNotificationPreferences),
  ]);

  return {
    data,
    reports,
    questions,
    reviews,
    questionCount: questions.items.length,
    reviewCount: reviews.items.length,
    notificationPreferences,
    canManageNotificationPreferences: notificationPreferencesAvailable,
  };
}
