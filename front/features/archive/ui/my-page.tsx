import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MyReadingShelf } from "./my-page/my-reading-shelf";
import type { RecentReadingListItem } from "./my-page/recent-reading-list";
import type { AvatarUpdateResult, ProfileUpdateResult } from "./my-page/types";

type MyPageProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  recentReadings: RecentReadingListItem[];
  canEditProfile: boolean;
  notificationsHref: string;
  settingsHref: string;
  archiveSessionsHref: string;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
  onUpdateAvatar: (avatarKey: string) => Promise<AvatarUpdateResult>;
};

export default function MyPage({
  profile,
  viewModel,
  recentReadings,
  canEditProfile,
  notificationsHref,
  settingsHref,
  archiveSessionsHref,
  onUpdateProfile,
  onUpdateAvatar,
}: MyPageProps) {
  return (
    <MyReadingShelf
      profile={profile}
      viewModel={viewModel}
      recentReadings={recentReadings}
      canEditProfile={canEditProfile}
      notificationsHref={notificationsHref}
      settingsHref={settingsHref}
      archiveSessionsHref={archiveSessionsHref}
      onUpdateProfile={onUpdateProfile}
      onUpdateAvatar={onUpdateAvatar}
    />
  );
}
