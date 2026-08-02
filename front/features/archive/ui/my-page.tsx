import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MyReadingShelf } from "./my-page/my-reading-shelf";
import type { RecentReadingListItem } from "./my-page/recent-reading-list";
import type { SaveProfile } from "./my-page/types";

type MyPageProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  recentReadings: RecentReadingListItem[];
  canEditProfile: boolean;
  notificationsHref: string;
  settingsHref: string;
  archiveSessionsHref: string;
  onSaveProfile: SaveProfile;
};

export default function MyPage({
  profile,
  viewModel,
  recentReadings,
  canEditProfile,
  notificationsHref,
  settingsHref,
  archiveSessionsHref,
  onSaveProfile,
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
      onSaveProfile={onSaveProfile}
    />
  );
}
