import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { DangerZone } from "./my-page/danger-zone";
import {
  AccountInformation,
  MembershipIdentity,
} from "./my-page/account-settings-sections";

export type AccountSettingsPageProps = {
  data: MyPageProfile;
  onLeaveMembership: () => Promise<void>;
};

export function AccountSettingsPage({
  data,
  onLeaveMembership,
}: AccountSettingsPageProps) {
  return (
    <main className="rm-account-settings-page">
      <header className="rm-account-settings-page__header">
        <h1>계정 설정</h1>
        <p>현재 계정과 현재 클럽의 멤버십 정보를 확인합니다.</p>
      </header>
      <div className="rm-account-settings-page__content">
        <AccountInformation data={data} />
        <MembershipIdentity data={data} />
        <div className="rm-account-settings-page__boundary">
          <DangerZone onLeaveMembership={onLeaveMembership} />
        </div>
      </div>
    </main>
  );
}
