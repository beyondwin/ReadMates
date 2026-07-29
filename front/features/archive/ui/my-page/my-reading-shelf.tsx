import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MemberProfileSummary } from "./member-profile-summary";
import { MemberSpaceOverview } from "./member-space-overview";
import {
  RecentReadingList,
  type RecentReadingListItem,
} from "./recent-reading-list";
import { ReadingAchievementSummary } from "./reading-achievement-summary";
import type { ProfileUpdateResult } from "./types";

export type MyReadingShelfProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  recentReadings: RecentReadingListItem[];
  canEditProfile: boolean;
  accountSettingsHref: string;
  recordsHref: string;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
};

export function MyReadingShelf({
  profile,
  viewModel,
  recentReadings,
  canEditProfile,
  accountSettingsHref,
  recordsHref,
  onUpdateProfile,
}: MyReadingShelfProps) {
  return (
    <main className="rm-my-shelf rm-member-space">
      <MemberSpaceOverview>
        <MemberProfileSummary
          profile={profile}
          viewModel={viewModel}
          canEditProfile={canEditProfile}
          accountSettingsHref={accountSettingsHref}
          onUpdateProfile={onUpdateProfile}
        />
        <ReadingAchievementSummary viewModel={viewModel} />
      </MemberSpaceOverview>
      <RecentReadingList
        items={recentReadings}
        recordsHref={recordsHref}
      />
    </main>
  );
}
