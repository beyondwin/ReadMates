import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MyReadingShelf } from "./my-page/my-reading-shelf";
import type { RecentReadingListItem } from "./my-page/recent-reading-list";
import type { ProfileUpdateResult } from "./my-page/types";

type MyPageProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  recentReadings: RecentReadingListItem[];
  canEditProfile: boolean;
  recordsHref: string;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
};

export default function MyPage({
  profile,
  viewModel,
  recentReadings,
  canEditProfile,
  recordsHref,
  onUpdateProfile,
}: MyPageProps) {
  return (
    <MyReadingShelf
      profile={profile}
      viewModel={viewModel}
      recentReadings={recentReadings}
      canEditProfile={canEditProfile}
      recordsHref={recordsHref}
      onUpdateProfile={onUpdateProfile}
    />
  );
}
