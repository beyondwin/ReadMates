import { useState } from "react";
import type {
  FeedbackDocumentListItem,
  MyPageProfile,
  NotificationPreferences,
} from "@/features/archive/model/archive-model";
import { profileSaveErrorMessage } from "@/features/archive/model/archive-model";
import type { PagedResponse } from "@/shared/model/paging";
import { MyDesktop } from "./my-page/my-desktop";
import { MyMobile } from "./my-page/my-mobile";
import type { LogoutControlComponent, ProfileUpdateResult } from "./my-page/types";
export type { LogoutControlComponent } from "./my-page/types";

type MyPageProps = {
  data: MyPageProfile;
  reports: PagedResponse<FeedbackDocumentListItem>;
  reviewCount: string;
  questionCount: string;
  LogoutButtonComponent: LogoutControlComponent;
  onLeaveMembership: () => Promise<void>;
  canEditProfile?: boolean;
  onUpdateProfile?: (displayName: string) => Promise<ProfileUpdateResult>;
  notificationPreferences: NotificationPreferences;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => Promise<NotificationPreferences>;
  canManageNotificationPreferences?: boolean;
  onLoadMoreReports?: () => Promise<void>;
};

export default function MyPage({
  data,
  reports,
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
}: MyPageProps) {
  const [profileOverrideState, setProfileOverrideState] = useState<{
    sourceData: MyPageProfile;
    profile: ProfileUpdateResult;
  } | null>(null);
  const profileOverride = profileOverrideState?.sourceData === data ? profileOverrideState.profile : null;
  const profileData = profileOverride ? { ...data, ...profileOverride } : data;
  const profileUpdateEnabled = canEditProfile && onUpdateProfile ? true : false;
  const notificationPreferencesEnabled = canManageNotificationPreferences && profileData.membershipStatus !== "VIEWER";

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
    <main className="rm-my-page">
      <div className="desktop-only">
        <MyDesktop
          data={profileData}
          reports={reports}
          reviewCount={reviewCount}
          questionCount={questionCount}
          LogoutButtonComponent={LogoutButtonComponent}
          onLeaveMembership={onLeaveMembership}
          canEditProfile={profileUpdateEnabled}
          onUpdateProfile={submitProfileUpdate}
          notificationPreferences={notificationPreferences}
          onSaveNotificationPreferences={onSaveNotificationPreferences}
          canManageNotificationPreferences={notificationPreferencesEnabled}
          onLoadMoreReports={onLoadMoreReports}
        />
      </div>
      <div className="mobile-only">
        <MyMobile
          data={profileData}
          reports={reports}
          reviewCount={reviewCount}
          questionCount={questionCount}
          LogoutButtonComponent={LogoutButtonComponent}
          onLeaveMembership={onLeaveMembership}
          canEditProfile={profileUpdateEnabled}
          onUpdateProfile={submitProfileUpdate}
          notificationPreferences={notificationPreferences}
          onSaveNotificationPreferences={onSaveNotificationPreferences}
          canManageNotificationPreferences={notificationPreferencesEnabled}
          onLoadMoreReports={onLoadMoreReports}
        />
      </div>
    </main>
  );
}
