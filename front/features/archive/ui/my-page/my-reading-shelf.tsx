import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MemberProfileSummary } from "./member-profile-summary";
import { ReadingAchievementSummary } from "./reading-achievement-summary";
import type { ProfileUpdateResult } from "./types";

export type MyReadingShelfProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  canEditProfile: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
};

export function MyReadingShelf({ profile, viewModel, canEditProfile, onUpdateProfile }: MyReadingShelfProps) {
  return (
    <main className="rm-my-shelf">
      <MemberProfileSummary
        profile={profile}
        viewModel={viewModel}
        canEditProfile={canEditProfile}
        accountSettingsHref="/app/me/settings"
        onUpdateProfile={onUpdateProfile}
      />
      <ReadingAchievementSummary viewModel={viewModel} />
    </main>
  );
}
