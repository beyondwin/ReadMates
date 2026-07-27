import { useState } from "react";
import type {
  ArchiveQuestionItem,
  ArchiveReviewItem,
  FeedbackDocumentListItem,
  MyPageProfile,
  NotificationPreferences,
} from "@/features/archive/model/archive-model";
import { defaultNotificationPreferences, profileSaveErrorMessage } from "@/features/archive/model/archive-model";
import type { PagedResponse } from "@/shared/model/paging";
import { MyDesktop } from "./my-page/my-desktop";
import { MyMobile } from "./my-page/my-mobile";
import type { LogoutControlComponent, ProfileUpdateResult } from "./my-page/types";
export type { LogoutControlComponent } from "./my-page/types";

type JourneyPage = {
  items: Array<{
    sessionId: string;
    sessionNumber: number;
    bookTitle: string;
    bookAuthor: string;
    bookImageUrl: string | null;
    date: string;
    feedbackDocument: { readable: boolean };
  }>;
  nextCursor: string | null;
  summary: {
    questionCount: number;
    reviewCount: number;
  };
};

type MyPageProps = {
  data: MyPageProfile;
  journey?: JourneyPage;
  reports?: PagedResponse<FeedbackDocumentListItem>;
  questions?: PagedResponse<ArchiveQuestionItem>;
  reviews?: PagedResponse<ArchiveReviewItem>;
  reviewCount?: string;
  questionCount?: string;
  LogoutButtonComponent: LogoutControlComponent;
  onLeaveMembership: () => Promise<void>;
  canEditProfile?: boolean;
  onUpdateProfile?: (displayName: string) => Promise<ProfileUpdateResult>;
  notificationPreferences?: NotificationPreferences;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => Promise<NotificationPreferences>;
  canManageNotificationPreferences?: boolean;
  onLoadMoreReports?: () => Promise<void>;
  onLoadMoreJourney?: () => Promise<void>;
  journeyPaginationPending?: boolean;
  journeyPaginationError?: boolean;
  notificationPreferencesError?: boolean;
  onRetryNotificationPreferences?: () => void;
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
};

function feedbackReportsFromJourney(journey: JourneyPage): PagedResponse<FeedbackDocumentListItem> {
  return {
    items: journey.items
      .filter((item) => item.feedbackDocument.readable)
      .map((item) => ({
        sessionId: item.sessionId,
        sessionNumber: item.sessionNumber,
        title: `독서모임 ${item.sessionNumber}차 피드백`,
        bookTitle: item.bookTitle,
        bookAuthor: item.bookAuthor,
        bookImageUrl: item.bookImageUrl,
        date: item.date,
        fileName: "feedback-document",
        uploadedAt: item.date,
      })),
    nextCursor: null,
  };
}

export default function MyPage({
  data,
  journey,
  reports,
  questions,
  reviews,
  reviewCount,
  questionCount,
  LogoutButtonComponent,
  onLeaveMembership,
  canEditProfile = false,
  onUpdateProfile,
  notificationPreferences,
  onSaveNotificationPreferences,
  canManageNotificationPreferences = true,
  onLoadMoreReports,
  onLoadMoreJourney,
  journeyPaginationPending = false,
  journeyPaginationError = false,
  notificationPreferencesError = false,
  onRetryNotificationPreferences,
  settingsOpen = true,
  onSettingsOpenChange,
}: MyPageProps) {
  const [profileOverrideState, setProfileOverrideState] = useState<{
    sourceData: MyPageProfile;
    profile: ProfileUpdateResult;
  } | null>(null);
  const profileOverride = profileOverrideState?.sourceData === data ? profileOverrideState.profile : null;
  const profileData = profileOverride ? { ...data, ...profileOverride } : data;
  const profileUpdateEnabled = canEditProfile && onUpdateProfile ? true : false;
  const notificationPreferencesEnabled = canManageNotificationPreferences && profileData.membershipStatus !== "VIEWER";
  const journeyReports = journey ? feedbackReportsFromJourney(journey) : reports ?? { items: [], nextCursor: null };
  const journeyQuestions = questions ?? { items: [], nextCursor: null };
  const journeyReviews = reviews ?? { items: [], nextCursor: null };
  const journeyQuestionCount = questionCount ?? String(journey?.summary.questionCount ?? 0);
  const journeyReviewCount = reviewCount ?? String(journey?.summary.reviewCount ?? 0);
  const preferences = notificationPreferences ?? defaultNotificationPreferences;

  async function submitProfileUpdate(displayName: string) {
    if (!onUpdateProfile) {
      throw new Error(profileSaveErrorMessage(null));
    }

    const profile = await onUpdateProfile(displayName);
    setProfileOverrideState({
      sourceData: data,
      profile: {
        displayName: profile.displayName,
        accountName: profile.accountName,
      },
    });
    return profile;
  }

  return (
    <main className="rm-my-page" data-settings-open={settingsOpen}>
      {notificationPreferencesError ? (
        <section className="container" aria-live="polite" style={{ paddingTop: "16px" }}>
          <p role="alert" className="small" style={{ margin: 0 }}>
            알림 설정을 불러오지 못했습니다.
          </p>
          {onRetryNotificationPreferences ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={onRetryNotificationPreferences}>
              다시 시도
            </button>
          ) : null}
        </section>
      ) : null}
      <div className="desktop-only">
        <MyDesktop
          data={profileData}
          reports={journeyReports}
          questions={journeyQuestions.items}
          reviews={journeyReviews.items}
          reviewCount={journeyReviewCount}
          questionCount={journeyQuestionCount}
          LogoutButtonComponent={LogoutButtonComponent}
          onLeaveMembership={onLeaveMembership}
          canEditProfile={profileUpdateEnabled}
          onUpdateProfile={submitProfileUpdate}
          notificationPreferences={preferences}
          onSaveNotificationPreferences={onSaveNotificationPreferences}
          canManageNotificationPreferences={notificationPreferencesEnabled}
          onLoadMoreReports={journey ? undefined : onLoadMoreReports}
          settingsOpen={settingsOpen}
          onSettingsOpenChange={onSettingsOpenChange}
        />
      </div>
      <div className="mobile-only">
        <MyMobile
          data={profileData}
          reports={journeyReports}
          questions={journeyQuestions.items}
          reviews={journeyReviews.items}
          reviewCount={journeyReviewCount}
          questionCount={journeyQuestionCount}
          LogoutButtonComponent={LogoutButtonComponent}
          onLeaveMembership={onLeaveMembership}
          canEditProfile={profileUpdateEnabled}
          onUpdateProfile={submitProfileUpdate}
          notificationPreferences={preferences}
          onSaveNotificationPreferences={onSaveNotificationPreferences}
          canManageNotificationPreferences={notificationPreferencesEnabled}
          onLoadMoreReports={journey ? undefined : onLoadMoreReports}
        />
      </div>
      {journey && (journey.nextCursor || journeyPaginationError) ? (
        <div className="container" style={{ display: "flex", justifyContent: "center", paddingBottom: "32px" }}>
          <div>
            {journeyPaginationError ? (
              <p role="alert" className="small" style={{ margin: "0 0 8px" }}>
                기록을 더 불러오지 못했습니다.
              </p>
            ) : null}
            <button type="button" className="btn btn-quiet" disabled={journeyPaginationPending} onClick={onLoadMoreJourney}>
              {journeyPaginationPending ? "기록을 불러오는 중" : journeyPaginationError ? "다시 시도" : "기록 더 보기"}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
