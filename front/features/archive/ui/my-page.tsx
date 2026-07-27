import { useState } from "react";
import type { MyPageProfile, NotificationPreferences } from "@/features/archive/model/archive-model";
import { defaultNotificationPreferences, profileSaveErrorMessage } from "@/features/archive/model/archive-model";
import type { MyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { DangerZone } from "./my-page/danger-zone";
import { MyReadingShelf } from "./my-page/my-reading-shelf";
import { NotificationsSection } from "./my-page/my-page-sections";
import { PreferencesSection } from "./my-page/preferences-section";
import type { LogoutControlComponent, ProfileUpdateResult } from "./my-page/types";

export type { LogoutControlComponent } from "./my-page/types";

type MyPageProps = {
  data: MyPageProfile;
  journey: MyJourneyPage;
  clubSlug?: string;
  LogoutButtonComponent: LogoutControlComponent;
  onLeaveMembership: () => Promise<void>;
  canEditProfile?: boolean;
  onUpdateProfile?: (displayName: string) => Promise<ProfileUpdateResult>;
  notificationPreferences?: NotificationPreferences;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => Promise<NotificationPreferences>;
  canManageNotificationPreferences?: boolean;
  notificationPreferencesError?: boolean;
  onRetryNotificationPreferences?: () => void;
  onLoadMoreJourney?: () => Promise<void>;
  journeyPaginationPending?: boolean;
  journeyPaginationError?: boolean;
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
};

export default function MyPage({
  data,
  journey,
  clubSlug = "",
  LogoutButtonComponent,
  onLeaveMembership,
  canEditProfile = false,
  onUpdateProfile,
  notificationPreferences,
  onSaveNotificationPreferences,
  canManageNotificationPreferences = true,
  notificationPreferencesError = false,
  onRetryNotificationPreferences,
  onLoadMoreJourney = async () => undefined,
  journeyPaginationPending = false,
  journeyPaginationError = false,
  settingsOpen = false,
  onSettingsOpenChange = () => undefined,
}: MyPageProps) {
  const [profileOverrideState, setProfileOverrideState] = useState<{
    sourceData: MyPageProfile;
    profile: ProfileUpdateResult;
  } | null>(null);
  const profileOverride = profileOverrideState?.sourceData === data ? profileOverrideState.profile : null;
  const profile = profileOverride ? { ...data, ...profileOverride } : data;
  const preferences = notificationPreferences ?? defaultNotificationPreferences;
  const notificationPreferencesEnabled = canManageNotificationPreferences && profile.membershipStatus !== "VIEWER";

  async function submitProfileUpdate(displayName: string) {
    if (!onUpdateProfile) {
      throw new Error(profileSaveErrorMessage(null));
    }

    const updatedProfile = await onUpdateProfile(displayName);
    setProfileOverrideState({
      sourceData: data,
      profile: {
        displayName: updatedProfile.displayName,
        accountName: updatedProfile.accountName,
      },
    });
    return updatedProfile;
  }

  const settings = (
    <>
      <PreferencesSection data={profile} canEditProfile={canEditProfile && Boolean(onUpdateProfile)} onUpdateProfile={submitProfileUpdate} />
      {notificationPreferencesError ? (
        <section className="rm-my-shelf-settings__notification-error" aria-label="알림 설정">
          <p role="alert">알림 설정을 불러오지 못했습니다.</p>
          {onRetryNotificationPreferences ? (
            <button type="button" className="btn btn-quiet" onClick={onRetryNotificationPreferences}>
              다시 시도
            </button>
          ) : null}
        </section>
      ) : notificationPreferencesEnabled ? (
        <NotificationsSection preferences={preferences} onSave={onSaveNotificationPreferences} />
      ) : null}
      <section className="rm-my-shelf-settings__logout">
        <LogoutButtonComponent className="btn btn-ghost">로그아웃</LogoutButtonComponent>
      </section>
      <DangerZone onLeaveMembership={onLeaveMembership} />
    </>
  );

  return (
    <MyReadingShelf
      profile={profile}
      journey={journey}
      clubSlug={clubSlug}
      settingsOpen={settingsOpen}
      onSettingsOpenChange={onSettingsOpenChange}
      journeyLoadMorePending={journeyPaginationPending}
      journeyLoadMoreError={journeyPaginationError}
      onLoadMoreJourney={onLoadMoreJourney}
      onRetryLoadMoreJourney={onLoadMoreJourney}
      settings={settings}
    />
  );
}
