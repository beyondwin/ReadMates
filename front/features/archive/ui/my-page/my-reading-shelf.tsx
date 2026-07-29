import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MemberProfileSummary } from "./member-profile-summary";
import { ReadingAchievementSummary } from "./reading-achievement-summary";
import type { ProfileUpdateResult } from "./types";

export type MyReadingShelfProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  canEditProfile: boolean;
  accountSettingsHref: string;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
};

export function MyReadingShelf({
  profile,
  viewModel,
  canEditProfile,
  accountSettingsHref,
  onUpdateProfile,
}: MyReadingShelfProps) {
  return (
    <main className="rm-my-shelf rm-member-space">
      <MemberProfileSummary
        profile={profile}
        viewModel={viewModel}
        canEditProfile={canEditProfile}
        accountSettingsHref={accountSettingsHref}
        onUpdateProfile={onUpdateProfile}
      />
      <ReadingAchievementSummary viewModel={viewModel} />
    </main>
  );
}
