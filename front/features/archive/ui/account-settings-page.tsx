import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { DangerZone } from "./my-page/danger-zone";
import { MembershipIdentity, PreferencesSection } from "./my-page/preferences-section";

type ProfileUpdateResult = Pick<MyPageProfile, "displayName" | "accountName">;

export type AccountSettingsPageProps = {
  data: MyPageProfile;
  canEditProfile: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
  onLeaveMembership: () => Promise<void>;
};

export function AccountSettingsPage({
  data,
  canEditProfile,
  onUpdateProfile,
  onLeaveMembership,
}: AccountSettingsPageProps) {
  return (
    <main className="rm-account-settings-page">
      <header className="rm-account-settings-page__header">
        <p className="rm-my-shelf-kicker">내 공간</p>
        <h1>계정 관리</h1>
        <p>프로필과 현재 클럽 멤버십 정보를 관리합니다.</p>
      </header>
      <div className="rm-account-settings-page__content">
        <PreferencesSection data={data} canEditProfile={canEditProfile} onUpdateProfile={onUpdateProfile} />
        <MembershipIdentity data={data} />
        <div className="rm-account-settings-page__boundary">
          <DangerZone onLeaveMembership={onLeaveMembership} />
        </div>
      </div>
    </main>
  );
}
