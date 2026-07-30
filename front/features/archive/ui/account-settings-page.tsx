import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { DangerZone } from "./my-page/danger-zone";
import {
  AccountInformation,
  MembershipIdentity,
} from "./my-page/account-settings-sections";

export type AccountSettingsPageProps = {
  data: MyPageProfile;
  mySpaceHref: string;
  onLeaveMembership: () => Promise<void>;
};

export function AccountSettingsPage({
  data,
  mySpaceHref,
  onLeaveMembership,
}: AccountSettingsPageProps) {
  return (
    <main className="rm-account-settings-page">
      <a className="rm-account-settings-page__back" href={mySpaceHref}>
        <span aria-hidden="true">←</span>
        <span>내 공간</span>
      </a>
      <header className="rm-account-settings-page__header">
        <p className="rm-my-shelf-kicker">내 공간</p>
        <h1>계정 설정</h1>
        <p>현재 계정과 읽는사이 멤버십 정보를 확인합니다.</p>
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
