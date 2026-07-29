import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MyReadingShelf } from "./my-page/my-reading-shelf";
import type { ProfileUpdateResult } from "./my-page/types";

type MyPageProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  canEditProfile: boolean;
  accountSettingsHref: string;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
};

export default function MyPage({
  profile,
  viewModel,
  canEditProfile,
  accountSettingsHref,
  onUpdateProfile,
}: MyPageProps) {
  return (
    <MyReadingShelf
      profile={profile}
      viewModel={viewModel}
      canEditProfile={canEditProfile}
      accountSettingsHref={accountSettingsHref}
      onUpdateProfile={onUpdateProfile}
    />
  );
}
