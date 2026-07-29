import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { ProfileNameEditor } from "./profile-name-editor";
import type { ProfileUpdateResult } from "./types";

export type MemberProfileSummaryProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  canEditProfile: boolean;
  accountSettingsHref: string;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
};

export function MemberProfileSummary({
  profile,
  viewModel,
  canEditProfile,
  accountSettingsHref,
  onUpdateProfile,
}: MemberProfileSummaryProps) {
  return (
    <section className="rm-member-profile" aria-labelledby="member-profile-name">
      <div className="rm-member-profile__avatar" aria-hidden>
        {viewModel.avatarLabel}
      </div>
      <p className="rm-member-space-kicker">내 프로필</p>
      <ProfileNameEditor
        data={profile}
        canEditProfile={canEditProfile}
        onUpdateProfile={onUpdateProfile}
        variant="member-space"
        headingId="member-profile-name"
        memberSpaceActions={(
          <a
            className="rm-member-profile__settings"
            href={accountSettingsHref}
            aria-label="계정 관리"
          >
            <span>계정 관리</span>
            <span aria-hidden="true">→</span>
          </a>
        )}
      />
      <p className="rm-member-profile__meta">{viewModel.profileMetaLabel}</p>
    </section>
  );
}
