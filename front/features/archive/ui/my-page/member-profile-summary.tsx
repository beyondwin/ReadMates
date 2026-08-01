import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { AvatarPicker } from "./avatar-picker";
import { ProfileNameEditor } from "./profile-name-editor";
import type { AvatarUpdateResult, ProfileUpdateResult } from "./types";

export type MemberProfileSummaryProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  canEditProfile: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
  onUpdateAvatar: (avatarKey: string) => Promise<AvatarUpdateResult>;
};

export function MemberProfileSummary({
  profile,
  viewModel,
  canEditProfile,
  onUpdateProfile,
  onUpdateAvatar,
}: MemberProfileSummaryProps) {
  return (
    <section className="rm-member-profile" aria-labelledby="member-profile-name">
      <AvatarPicker
        avatarKey={profile.avatarKey}
        canEditProfile={canEditProfile}
        onUpdateAvatar={onUpdateAvatar}
      />
      <p className="rm-member-space-kicker">내 프로필</p>
      <ProfileNameEditor
        data={profile}
        canEditProfile={canEditProfile}
        onUpdateProfile={onUpdateProfile}
        headingId="member-profile-name"
      />
      <p className="rm-member-profile__meta">{viewModel.profileMetaLabel}</p>
    </section>
  );
}
