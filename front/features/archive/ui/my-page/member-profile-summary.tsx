import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { normalizeBookClubAvatarKey } from "@/shared/ui/book-club-avatar";
import { AvatarPicker } from "./avatar-picker";
import { ProfileNameEditor } from "./profile-name-editor";
import type { SaveProfile } from "./types";

export type MemberProfileSummaryProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  canEditProfile: boolean;
  onSaveProfile: SaveProfile;
};

export function MemberProfileSummary({
  profile,
  viewModel,
  canEditProfile,
  onSaveProfile,
}: MemberProfileSummaryProps) {
  return (
    <section className="rm-member-profile" aria-labelledby="member-profile-name">
      <AvatarPicker
        avatarKey={profile.avatarKey}
        canEditProfile={canEditProfile}
        onUpdateAvatar={(avatarKey) => onSaveProfile({ displayName: profile.displayName, avatarKey })}
      />
      <p className="rm-member-space-kicker">내 프로필</p>
      <ProfileNameEditor
        data={profile}
        canEditProfile={canEditProfile}
        onUpdateProfile={(displayName) => onSaveProfile({
          displayName,
          avatarKey: normalizeBookClubAvatarKey(profile.avatarKey),
        })}
        headingId="member-profile-name"
      />
      <p className="rm-member-profile__meta">{viewModel.profileMetaLabel}</p>
    </section>
  );
}
