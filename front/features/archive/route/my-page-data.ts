import {
  fetchNotificationPreferences,
  fetchMyJourney,
  fetchMyPage,
} from "@/features/archive/api/archive-api";
import type {
  MyJourneyPage,
  MyPageResponse,
  NotificationPreferencesResponse,
} from "@/features/archive/api/archive-contracts";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import type { LoaderFunctionArgs } from "react-router-dom";

export type NotificationPreferencesLoadState =
  | { status: "ready"; preferences: NotificationPreferencesResponse }
  | { status: "unavailable" }
  | { status: "error" };

export type MyPageRouteData = {
  profile: MyPageResponse;
  journey: MyJourneyPage;
  notificationPreferences: NotificationPreferencesLoadState;
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
    completedReadingCount: 0,
    recentAttendances: [],
  };
}

function canManageNotificationPreferences(auth: AuthMeResponse) {
  return auth.membershipStatus !== "VIEWER";
}

function emptyJourney(): MyJourneyPage {
  return {
    items: [],
    nextCursor: null,
    summary: {
      attendedSessionCount: 0,
      completedReadingCount: 0,
      questionCount: 0,
      reviewCount: 0,
      readableFeedbackDocumentCount: 0,
    },
  };
}

export async function myPageLoader(args?: LoaderFunctionArgs): Promise<MyPageRouteData> {
  const access = await loadArchiveMemberAuth(args);
  const context = { clubSlug: clubSlugFromLoaderArgs(args) };
  const notificationPreferencesAvailable = access.allowed && canManageNotificationPreferences(access.auth);

  if (!access.allowed) {
    return {
      profile: inactiveMyPageData(access.auth),
      journey: emptyJourney(),
      notificationPreferences: { status: "unavailable" },
    };
  }

  const notificationPreferencesPromise = notificationPreferencesAvailable
    ? fetchNotificationPreferences(context)
        .then((preferences) => ({ status: "ready", preferences }) as const)
        .catch(() => ({ status: "error" }) as const)
    : Promise.resolve({ status: "unavailable" } as const);

  const [profile, journey, notificationPreferences] = await Promise.all([
    fetchMyPage(context),
    fetchMyJourney(context, { limit: 12 }),
    notificationPreferencesPromise,
  ]);

  return {
    profile,
    journey,
    notificationPreferences,
  };
}
