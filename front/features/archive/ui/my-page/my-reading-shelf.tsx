import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MemberProfileSummary } from "./member-profile-summary";
import { MemberSpaceOverview } from "./member-space-overview";
import { MemberSpaceUtilityNav } from "./member-space-utility-nav";
import {
  RecentReadingList,
  type RecentReadingListItem,
} from "./recent-reading-list";
import { ReadingAchievementSummary } from "./reading-achievement-summary";
import type { AvatarUpdateResult, ProfileUpdateResult } from "./types";

export type MyReadingShelfProps = {
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

export function MyReadingShelf({
  profile,
  viewModel,
  recentReadings,
  canEditProfile,
  notificationsHref,
  settingsHref,
  archiveSessionsHref,
  onUpdateProfile,
  onUpdateAvatar,
}: MyReadingShelfProps) {
  return (
    <main className="rm-my-shelf rm-member-space">
      <MemberSpaceOverview>
        <MemberProfileSummary
          profile={profile}
          viewModel={viewModel}
          canEditProfile={canEditProfile}
          onUpdateProfile={onUpdateProfile}
          onUpdateAvatar={onUpdateAvatar}
        />
        <ReadingAchievementSummary viewModel={viewModel} />
      </MemberSpaceOverview>
      <MemberSpaceUtilityNav
        notificationsHref={notificationsHref}
        settingsHref={settingsHref}
      />
      <RecentReadingList
        items={recentReadings}
        archiveSessionsHref={archiveSessionsHref}
      />
    </main>
  );
}
